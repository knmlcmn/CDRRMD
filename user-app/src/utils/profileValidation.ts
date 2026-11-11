export type EditableProfile = {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  contactNumber: string;
};

export type ProfileField = keyof EditableProfile;
export type ProfileValidationErrors = Partial<Record<ProfileField, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEditableProfile(input: EditableProfile) {
  const profile: EditableProfile = {
    firstName: String(input.firstName ?? '').trim(),
    lastName: String(input.lastName ?? '').trim(),
    email: String(input.email ?? '').trim().toLowerCase(),
    address: String(input.address ?? '').trim(),
    contactNumber: String(input.contactNumber ?? '').trim(),
  };
  const errors: ProfileValidationErrors = {};

  if (!profile.firstName) errors.firstName = 'First name is required.';
  else if (profile.firstName.length > 120) errors.firstName = 'First name must be 120 characters or fewer.';

  if (!profile.lastName) errors.lastName = 'Last name is required.';
  else if (profile.lastName.length > 120) errors.lastName = 'Last name must be 120 characters or fewer.';

  if (!profile.email) errors.email = 'Email is required.';
  else if (!EMAIL_PATTERN.test(profile.email) || profile.email.length > 160) errors.email = 'Enter a valid email address.';

  if (!profile.address) errors.address = 'Address is required.';

  if (profile.contactNumber && !/^\d+$/.test(profile.contactNumber)) {
    errors.contactNumber = 'Contact number must contain numbers only.';
  } else if (profile.contactNumber.length > 40) {
    errors.contactNumber = 'Contact number must be 40 digits or fewer.';
  }

  return { profile, errors, isValid: Object.keys(errors).length === 0 };
}
