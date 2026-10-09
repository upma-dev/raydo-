import { ApiError } from '../../../../utils/ApiError.js';
import { User } from '../../user/models/User.js';
import { verifyAccessToken } from '../../services/tokenService.js';

export const getIdentityFromSocket = (socket) => {
  let token =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    socket.handshake.headers?.authorization;

  if (typeof token === 'string' && token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }

  if (!token) {
    return null;
  }

  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
};

export const attachSocketAuth = (io) => {
  io.use(async (socket, next) => {
    try {
      const identity = getIdentityFromSocket(socket);

      if (identity) {
        socket.auth = identity;

        if (socket.auth.role === 'user') {
          const user = await User.findById(socket.auth.sub).select('active isActive deletedAt').lean();

          if (user && (user.deletedAt || user.isActive === false || user.active === false)) {
            return next(new Error('User account is not active'));
          }
        }
      }

      next();
    } catch {
      next();
    }
  });
};
