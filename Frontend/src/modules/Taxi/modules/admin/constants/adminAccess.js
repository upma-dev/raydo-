export const ADMIN_PERMISSION_GROUPS = [
  {
    title: 'Core Access',
    items: [
      { key: 'dashboard.view', label: 'Dashboard' },
      { key: 'earnings.view', label: 'Admin Earnings' },
      { key: 'chat.view', label: 'Chat' },
      { key: 'promotions.view', label: 'Promotions' },
      { key: 'subadmins.manage', label: 'Subadmins' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { key: 'trips.view', label: 'Trip Requests' },
      { key: 'deliveries.view', label: 'Delivery Requests' },
      { key: 'ongoing.view', label: 'Ongoing Requests' },
      { key: 'drivers.view', label: 'Drivers' },
      { key: 'users.view', label: 'Customers' },
      { key: 'wallet.view', label: 'Wallet' },
      { key: 'owners.view', label: 'Owners' },
      { key: 'support.view', label: 'Support' },
      { key: 'reports.view', label: 'Reports' },
      { key: 'referrals.view', label: 'Referrals' },
    ],
  },
  {
    title: 'Pricing Scope',
    items: [
      { key: 'service_locations.view', label: 'Service Locations' },
      { key: 'zones.view', label: 'Zones' },
      { key: 'airports.view', label: 'Airports' },
      { key: 'service_stores.view', label: 'Service Stores' },
      { key: 'vehicle_types.view', label: 'Vehicle Types' },
      { key: 'set_prices.view', label: 'Set Prices' },
      { key: 'goods_types.view', label: 'Goods Types' },
      { key: 'rental.view', label: 'Rental Modules' },
      { key: 'bus_service.view', label: 'Bus Service' },
      { key: 'pooling.view', label: 'Pooling' },
      { key: 'geofencing.view', label: 'Geofencing' },
    ],
  },
];

export const ALL_ADMIN_PERMISSIONS = ADMIN_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export const hasAdminPermission = (adminInfo = {}, permission) => {
  if (!permission) return true;

  const rawAdminLevel = String(adminInfo?.adminLevel || adminInfo?.admin_level || '').trim().toLowerCase();
  const rawAdminType = String(adminInfo?.admin_type || '').trim().toLowerCase();
  const rawRole = String(adminInfo?.role || '').trim().toLowerCase();
  const permissions = (Array.isArray(adminInfo?.permissions) ? adminInfo.permissions : []).map((p) => String(p || '').trim().toLowerCase());

  if (permissions.includes('*') || permissions.includes('all')) return true;

  const isSubadmin =
    rawAdminType === 'subadmin' ||
    rawAdminLevel === 'subadmin' ||
    rawRole.includes('subadmin');

  if (!isSubadmin) {
    if (
      rawAdminLevel === 'platform_superadmin' ||
      rawAdminLevel === 'taxi_superadmin' ||
      rawAdminLevel === 'food_superadmin' ||
      rawAdminLevel === 'system_admin' ||
      rawAdminLevel === 'superadmin' ||
      rawAdminType === 'superadmin' ||
      rawRole === 'superadmin'
    ) {
      return true;
    }
  }

  const permStr = String(permission || '').trim().toLowerCase();
  const dotIndex = permStr.lastIndexOf('.');
  const baseResource = dotIndex === -1 ? permStr : permStr.slice(0, dotIndex);

  const variants = [
    permStr,
    baseResource,
    `${baseResource}.view`,
    `${baseResource}.read`,
    `${baseResource}.write`,
    `${baseResource}.manage`,
  ];

  return variants.some((v) => permissions.includes(v));
};

export const canManageSubadmins = (adminInfo = {}) => hasAdminPermission(adminInfo, 'subadmins.manage') || hasAdminPermission(adminInfo, 'subadmins');
