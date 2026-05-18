export type LvvUserType = "master" | "vendor";

export const LVV_USER_TYPE_SESSION_KEY = "LVV_USER_TYPE";

export function normalizeLvvUserType(value: string | null | undefined): LvvUserType {
  return value === "master" ? "master" : "vendor";
}

export function getStoredLvvUserType(): LvvUserType {
  if (typeof sessionStorage === "undefined") {
    return "vendor";
  }

  return normalizeLvvUserType(sessionStorage.getItem(LVV_USER_TYPE_SESSION_KEY));
}

export function getInitialLvvUserType(isLocalDesktop: boolean): LvvUserType {
  return isLocalDesktop ? getStoredLvvUserType() : "vendor";
}

export function applyLocalMasterUserTypeOverride({
  resolvedUserType,
  isLocalDesktop,
  storedUserType,
}: {
  resolvedUserType: LvvUserType;
  isLocalDesktop: boolean;
  storedUserType: LvvUserType;
}): LvvUserType {
  if (isLocalDesktop && storedUserType === "master" && resolvedUserType !== "master") {
    return "master";
  }

  return resolvedUserType;
}
