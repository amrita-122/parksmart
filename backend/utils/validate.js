// Small input checks for request bodies. Every value that reaches a Mongo query
// must be a primitive of the expected type: an object such as { "$ne": null }
// would otherwise be treated as a query operator.

const isString = (v, max = 200) => typeof v === "string" && v.length > 0 && v.length <= max;
const isEmail = (v) => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v) => typeof v === "string" && /^[0-9]{10}$/.test(v);
const isObjectId = (v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);

module.exports = { isString, isEmail, isPhone, isObjectId };
