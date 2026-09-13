import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionData } from './session';

export type AppProfile = {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  contactNumber: string;
};

export type AppAccount = {
  appUserId: string;
  backendUserId: number;
  username: string;
  profile: AppProfile;
  familyIds: string[];
};

type PartialProfile = Partial<AppProfile>;

type Registry = {
  accountsById: Record<string, AppAccount>;
  backendToAppId: Record<string, string>;
};

type InviteResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'self' | 'exists' };

const REGISTRY_KEY = '@cddrmd:account_registry';

const EMPTY_PROFILE: AppProfile = {
  firstName: '',
  lastName: '',
  email: '',
  address: '',
  contactNumber: '',
};

function clean(value?: string | null) {
  return String(value ?? '').trim();
}

function mergeProfile(current: AppProfile, next?: PartialProfile): AppProfile {
  if (!next) {
    return current;
  }

  return {
    firstName: clean(next.firstName) || current.firstName,
    lastName: clean(next.lastName) || current.lastName,
    email: clean(next.email) || current.email,
    address: clean(next.address) || current.address,
    contactNumber: clean(next.contactNumber) || current.contactNumber,
  };
}

function defaultRegistry(): Registry {
  return {
    accountsById: {},
    backendToAppId: {},
  };
}

async function readRegistry(): Promise<Registry> {
  const raw = await AsyncStorage.getItem(REGISTRY_KEY);
  if (!raw) {
    return defaultRegistry();
  }

  try {
    const parsed = JSON.parse(raw) as Registry;
    return {
      accountsById: parsed?.accountsById ?? {},
      backendToAppId: parsed?.backendToAppId ?? {},
    };
  } catch {
    return defaultRegistry();
  }
}

async function writeRegistry(registry: Registry) {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

function generateUniqueId(existingIds: Set<string>) {
  let nextId = '';

  do {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const time = Date.now().toString(36).toUpperCase();
    nextId = `USR-${time}-${rand}`;
  } while (existingIds.has(nextId));

  return nextId;
}

export async function ensureAccountForSession(session: SessionData) {
  const registry = await readRegistry();
  const backendKey = String(session.user.id);
  const sessionProfile: PartialProfile = {
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    email: session.user.email,
    address: session.user.address,
    contactNumber: session.user.contactNumber,
  };

  const fromSession = session.appUserId ? registry.accountsById[session.appUserId] : undefined;
  if (fromSession) {
    const mergedAccount: AppAccount = {
      ...fromSession,
      profile: mergeProfile(fromSession.profile, sessionProfile),
    };
    registry.accountsById[fromSession.appUserId] = mergedAccount;
    await writeRegistry(registry);

    return {
      session: { ...session, appUserId: mergedAccount.appUserId },
      account: mergedAccount,
    };
  }

  const linkedAppUserId = registry.backendToAppId[backendKey];
  if (linkedAppUserId && registry.accountsById[linkedAppUserId]) {
    const linkedAccount = registry.accountsById[linkedAppUserId];
    const mergedAccount: AppAccount = {
      ...linkedAccount,
      profile: mergeProfile(linkedAccount.profile, sessionProfile),
    };
    registry.accountsById[linkedAppUserId] = mergedAccount;
    await writeRegistry(registry);

    return {
      session: { ...session, appUserId: linkedAppUserId },
      account: mergedAccount,
    };
  }

  const nextId = generateUniqueId(new Set(Object.keys(registry.accountsById)));
  const account: AppAccount = {
    appUserId: nextId,
    backendUserId: session.user.id,
    username: session.user.username,
    profile: mergeProfile({ ...EMPTY_PROFILE }, sessionProfile),
    familyIds: [],
  };

  registry.accountsById[nextId] = account;
  registry.backendToAppId[backendKey] = nextId;
  await writeRegistry(registry);

  return {
    session: { ...session, appUserId: nextId },
    account,
  };
}

export async function getAccountById(appUserId: string) {
  const registry = await readRegistry();
  return registry.accountsById[appUserId] ?? null;
}

export async function updateAccountProfile(appUserId: string, profile: AppProfile) {
  const registry = await readRegistry();
  const account = registry.accountsById[appUserId];
  if (!account) {
    return null;
  }

  const nextAccount: AppAccount = {
    ...account,
    profile,
  };

  registry.accountsById[appUserId] = nextAccount;
  await writeRegistry(registry);
  return nextAccount;
}

export async function patchAccountProfile(appUserId: string, partial: PartialProfile) {
  const account = await getAccountById(appUserId);
  if (!account) {
    return null;
  }

  const merged = mergeProfile(account.profile, partial);
  return updateAccountProfile(appUserId, merged);
}

export async function inviteFamilyById(appUserId: string, familyAppUserId: string): Promise<InviteResult> {
  const registry = await readRegistry();
  const account = registry.accountsById[appUserId];
  const target = registry.accountsById[familyAppUserId];

  if (!account || !target) {
    return { ok: false, reason: 'not-found' };
  }

  if (appUserId === familyAppUserId) {
    return { ok: false, reason: 'self' };
  }

  if (account.familyIds.includes(familyAppUserId)) {
    return { ok: false, reason: 'exists' };
  }

  registry.accountsById[appUserId] = {
    ...account,
    familyIds: [familyAppUserId, ...account.familyIds],
  };

  await writeRegistry(registry);
  return { ok: true };
}

export async function getFamilyAccounts(appUserId: string) {
  const registry = await readRegistry();
  const account = registry.accountsById[appUserId];
  if (!account) {
    return [] as AppAccount[];
  }

  return account.familyIds
    .map((id) => registry.accountsById[id])
    .filter((member): member is AppAccount => Boolean(member));
}
