const SUPPORTED_BARANGAYS = ['Palingon', 'Sampiruhan', 'Lingga', 'Parian', 'Looc', 'Uwisan'];

function normalizeBarangayName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^(brgy\.?|barangay)\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SUPPORTED_BARANGAY_KEYS = new Set(SUPPORTED_BARANGAYS.map(normalizeBarangayName));

function isSupportedBarangay(value) {
  return SUPPORTED_BARANGAY_KEYS.has(normalizeBarangayName(value));
}

module.exports = { SUPPORTED_BARANGAYS, isSupportedBarangay, normalizeBarangayName };
