const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROFILE_FIELDS = ['firstName', 'lastName', 'email', 'address', 'contactNumber'];
const RESIDENT_REQUIRED_FIELDS = new Set(['firstName', 'lastName', 'email', 'address']);

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value || {}, field);
}

function currentProfile(user) {
  return {
    firstName: user?.first_name ?? null,
    lastName: user?.last_name ?? null,
    email: user?.email ?? null,
    address: user?.address ?? null,
    contactNumber: user?.contact_number ?? null,
  };
}

function validateProfileUpdate(input, user) {
  const profile = currentProfile(user);
  const errors = {};
  const resident = user?.role === 'user';

  for (const field of PROFILE_FIELDS) {
    if (!hasOwn(input, field)) continue;
    const value = String(input[field] ?? '').trim();
    profile[field] = field === 'email' ? value.toLowerCase() : value || null;

    if (resident && RESIDENT_REQUIRED_FIELDS.has(field) && !value) {
      const label = field === 'firstName' ? 'First name' : field === 'lastName' ? 'Last name' : field === 'email' ? 'Email' : 'Address';
      errors[field] = `${label} is required.`;
    }
  }

  if (hasOwn(input, 'firstName') && profile.firstName && profile.firstName.length > 120) {
    errors.firstName = 'First name must be 120 characters or fewer.';
  }

  if (hasOwn(input, 'lastName') && profile.lastName && profile.lastName.length > 120) {
    errors.lastName = 'Last name must be 120 characters or fewer.';
  }

  if (hasOwn(input, 'email')) {
    if (!profile.email) errors.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(profile.email) || profile.email.length > 160) errors.email = 'Enter a valid email address.';
  }

  if (resident && hasOwn(input, 'contactNumber') && profile.contactNumber && !/^\d+$/.test(profile.contactNumber)) {
    errors.contactNumber = 'Contact number must contain numbers only.';
  } else if (hasOwn(input, 'contactNumber') && profile.contactNumber && profile.contactNumber.length > 40) {
    errors.contactNumber = 'Contact number must be 40 digits or fewer.';
  }

  return { profile, errors, isValid: Object.keys(errors).length === 0 };
}

module.exports = { validateProfileUpdate };
