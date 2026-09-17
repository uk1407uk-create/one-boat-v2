(function(){'use strict';
// Deprecated compatibility shim.
// Formal performance aggregation is server-side only:
// Cloudflare /api/admin-readonly -> Supabase one-boat-admin-readonly -> ob_admin_performance_aggregate().
// Never rebuild cumulative/7d/30d/venue/theory totals from /api/history in the browser.
window.__ONE_BOAT_PERFORMANCE_AGGREGATION='server_side_sql';
})();
