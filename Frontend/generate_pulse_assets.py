import cv2
import numpy as np
import os
import math

public_dir = r"s:\Raydo\Frontend\public"
assets_dir = r"s:\Raydo\Frontend\src\assets"

width, height = 1280, 720
fps = 30
duration = 5
total_frames = fps * duration

fourcc = cv2.VideoWriter_fourcc(*'mp4v')

def create_writer(filename):
    pub_path = os.path.join(public_dir, filename)
    ast_path = os.path.join(assets_dir, filename)
    w_pub = cv2.VideoWriter(pub_path, fourcc, fps, (width, height))
    w_ast = cv2.VideoWriter(ast_path, fourcc, fps, (width, height))
    return w_pub, w_ast

print("Rendering 6 Cinematic Motion Videos for RAYDO PULSE 3D Network...")

# Load source images if available
net_p = os.path.join(assets_dir, "cinematic_raydo_network_ecosystem.png")
taxi_p = os.path.join(assets_dir, "cinematic_taxi_moving_night.png")
food_p = os.path.join(assets_dir, "cinematic_food_rider_moving.png")
bus_p = os.path.join(assets_dir, "cinematic_bus_travel_highway.png")

def load_res(p):
    if os.path.exists(p):
        img = cv2.imread(p)
        if img is not None:
            return cv2.resize(img, (width, height), interpolation=cv2.INTER_CUBIC)
    return np.zeros((height, width, 3), dtype=np.uint8)

img_net = load_res(net_p)
img_taxi = load_res(taxi_p)
img_food = load_res(food_p)
img_bus = load_res(bus_p)

# -------------------------------------------------------------
# VIDEO 01: THE CORE (pulse_01_core.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("pulse_01_core.mp4")
np.random.seed(1)
core_particles = [{'r': np.random.uniform(50, 250), 'a': np.random.uniform(0, 2*math.pi), 's': np.random.uniform(0.01, 0.03)} for _ in range(80)]

for f in range(total_frames):
    t = f / float(total_frames)
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Dark Navy Base #050713
    canvas[:] = (19, 7, 5)
    
    # Center RAYDO Core Hub Glowing Circle
    cx, cy = int(width * 0.65), int(height * 0.5)
    pulse_r = int(70 + math.sin(t * 4 * math.pi) * 8)
    
    # Glow rings
    cv2.circle(canvas, (cx, cy), pulse_r + 40, (0, 100, 180), -1)
    cv2.circle(canvas, (cx, cy), pulse_r + 20, (0, 160, 230), -1)
    cv2.circle(canvas, (cx, cy), pulse_r, (0, 196, 255), -1)
    cv2.circle(canvas, (cx, cy), 35, (255, 255, 255), -1)

    # Core Route Ribbon growing out
    pts = []
    for step in range(60):
        st = step / 60.0
        r_angle = st * math.pi * 1.2 + t * 0.5
        r_radius = st * 350
        px = int(cx + math.cos(r_angle) * r_radius)
        py = int(cy + math.sin(r_angle) * r_radius * 0.5)
        pts.append((px, py))
    if len(pts) > 1:
        cv2.polylines(canvas, [np.array(pts)], False, (0, 196, 255), 4, cv2.LINE_AA)

    # Particles around hub
    for p in core_particles:
        p['a'] += p['s']
        px = int(cx + math.cos(p['a']) * p['r'])
        py = int(cy + math.sin(p['a']) * p['r'] * 0.5)
        if 0 <= px < width and 0 <= py < height:
            cv2.circle(canvas, (px, py), 2, (0, 215, 255), -1)

    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Pulse Video 01 generated.")

# -------------------------------------------------------------
# VIDEO 02: RIDES (pulse_02_rides.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("pulse_02_rides.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.0 + t * 0.05
    M = np.float32([[scale, 0, t*15 - (scale-1)*width/2], [0, scale, -t*10 - (scale-1)*height/2]])
    base = cv2.warpAffine(img_taxi, M, (width, height))
    
    blue_overlay = np.full((height, width, 3), (255, 92, 49), dtype=np.uint8) # BGR Electric Blue
    canvas = cv2.addWeighted(base, 0.75, blue_overlay, 0.25, 0)
    
    p1 = (100, int(height * 0.8))
    p2 = (int(width * 0.5), int(height * 0.5 + math.sin(t*2*math.pi)*12))
    p3 = (width - 100, int(height * 0.3))
    cv2.polylines(canvas, [np.array([p1, p2, p3])], False, (255, 120, 49), 5, cv2.LINE_AA)
    
    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Pulse Video 02 generated.")

# -------------------------------------------------------------
# VIDEO 03: FOOD (pulse_03_food.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("pulse_03_food.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.05 - t * 0.05
    M = np.float32([[scale, 0, -t*20 - (scale-1)*width/2], [0, scale, -(scale-1)*height/2]])
    base = cv2.warpAffine(img_food, M, (width, height))
    
    orange_overlay = np.full((height, width, 3), (0, 138, 255), dtype=np.uint8)
    canvas = cv2.addWeighted(base, 0.75, orange_overlay, 0.25, 0)

    p1 = (int(width*0.2), int(height*0.85))
    p2 = (int(width*0.6), int(height*0.45 + math.sin(t*3*math.pi)*10))
    p3 = (width - 80, int(height*0.25))
    cv2.polylines(canvas, [np.array([p1, p2, p3])], False, (0, 196, 255), 5, cv2.LINE_AA)

    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Pulse Video 03 generated.")

# -------------------------------------------------------------
# VIDEO 04: DELIVERY (pulse_04_delivery.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("pulse_04_delivery.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.0 + t * 0.06
    M = np.float32([[scale, 0, t*15 - (scale-1)*width/2], [0, scale, -t*10 - (scale-1)*height/2]])
    base = cv2.warpAffine(img_food, M, (width, height))
    
    yellow_overlay = np.full((height, width, 3), (0, 180, 255), dtype=np.uint8)
    canvas = cv2.addWeighted(base, 0.8, yellow_overlay, 0.2, 0)

    p1 = (80, int(height*0.3))
    p2 = (int(width*0.5), int(height*0.7))
    p3 = (width - 120, int(height*0.4))
    cv2.polylines(canvas, [np.array([p1, p2, p3])], False, (0, 215, 255), 5, cv2.LINE_AA)

    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Pulse Video 04 generated.")

# -------------------------------------------------------------
# VIDEO 05: TRAVEL (pulse_05_travel.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("pulse_05_travel.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.0 + t * 0.08
    M = np.float32([[scale, 0, -t*15 - (scale-1)*width/2], [0, scale, -t*15 - (scale-1)*height/2]])
    base = cv2.warpAffine(img_bus, M, (width, height))
    
    purple_overlay = np.full((height, width, 3), (214, 55, 113), dtype=np.uint8)
    canvas = cv2.addWeighted(base, 0.75, purple_overlay, 0.25, 0)

    p1 = (0, int(height*0.9))
    p2 = (int(width*0.55), int(height*0.45))
    p3 = (width, int(height*0.15))
    cv2.polylines(canvas, [np.array([p1, p2, p3])], False, (245, 71, 113), 5, cv2.LINE_AA)

    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Pulse Video 05 generated.")

# -------------------------------------------------------------
# VIDEO 06: NETWORK REVEAL (pulse_06_network.mp4)
# -------------------------------------------------------------
w_pub, w_ast = create_writer("pulse_06_network.mp4")
for f in range(total_frames):
    t = f / float(total_frames)
    scale = 1.0 + math.sin(t * math.pi) * 0.04
    M = np.float32([[scale, 0, -(scale-1)*width/2], [0, scale, -(scale-1)*height/2]])
    canvas = cv2.warpAffine(img_net, M, (width, height))

    cx, cy = int(width*0.55), int(height*0.5)
    cv2.circle(canvas, (cx, cy), 50, (0, 196, 255), -1)
    
    cv2.line(canvas, (100, 100), (cx, cy), (255, 92, 49), 4, cv2.LINE_AA)
    cv2.line(canvas, (width-100, 120), (cx, cy), (0, 138, 255), 4, cv2.LINE_AA)
    cv2.line(canvas, (120, height-100), (cx, cy), (0, 215, 255), 4, cv2.LINE_AA)
    cv2.line(canvas, (width-120, height-120), (cx, cy), (245, 71, 113), 4, cv2.LINE_AA)

    w_pub.write(canvas)
    w_ast.write(canvas)
w_pub.release()
w_ast.release()
print("Pulse Video 06 generated successfully!")
