const RATE_PER_HOUR = 5; // $5/hr, billed per started hour

// Price in whole dollars for a booking. The server is the only place that sets it.
function priceForDuration(start, end) {
  const hours = Math.ceil((new Date(end) - new Date(start)) / (60 * 60 * 1000));
  return hours * RATE_PER_HOUR;
}

module.exports = { RATE_PER_HOUR, priceForDuration };
