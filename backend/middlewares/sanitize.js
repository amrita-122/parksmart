// Defence in depth against NoSQL operator injection: drop any key that starts with
// "$" or contains "." from the body and query string before a route sees it.
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("$") && !key.includes("."))
        .map(([key, v]) => [key, clean(v)])
    );
  }
  return value;
};

module.exports = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  next();
};
