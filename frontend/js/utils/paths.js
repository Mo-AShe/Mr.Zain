export function getBasePath() {
  const { hostname, pathname } = window.location;
  if (hostname.endsWith("github.io")) {
    const parts = pathname.split("/").filter(Boolean);
    return parts.length > 0 ? `/${parts[0]}` : "";
  }
  return "";
}

export function appUrl(path) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${getBasePath()}${clean}`;
}
