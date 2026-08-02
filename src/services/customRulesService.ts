// src/services/customRulesService.ts
// Admin authentication (Password: 2580) and Dynamic Custom AI Rules Storage

const CUSTOM_RULES_KEY = 'akgun_ai_custom_rules';
const ADMIN_AUTH_KEY = 'akgun_ai_admin_session';
const ADMIN_PASSWORD = '2580';

const adminAuthListeners = new Set<() => void>();

export function subscribeAdminAuthChange(callback: () => void) {
  adminAuthListeners.add(callback);
  return () => adminAuthListeners.delete(callback);
}

function notifyAdminAuthChange() {
  adminAuthListeners.forEach(fn => fn());
}

/**
 * Check if current session is authenticated as Admin
 */
export function isAdminAuthenticated(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ADMIN_AUTH_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

/**
 * Authenticate Admin with password "2580"
 */
export function authenticateAdmin(password: string): boolean {
  if (String(password).trim() === ADMIN_PASSWORD) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(ADMIN_AUTH_KEY, 'true');
      }
      notifyAdminAuthChange();
    } catch (e) { console.error(e); }
    return true;
  }
  return false;
}

/**
 * Logout Admin
 */
export function logoutAdmin() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ADMIN_AUTH_KEY);
    }
    notifyAdminAuthChange();
  } catch (e) { console.error(e); }
}

export interface CustomRule {
  id: string;
  text: string;
  createdAt: string;
}

/**
 * Get all custom dynamic rules created by Admin
 */
export function getCustomRules(): CustomRule[] {
  try {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(CUSTOM_RULES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Add a new custom rule by Admin
 */
export function addCustomRule(ruleText: string): CustomRule | false {
  if (!ruleText || !ruleText.trim()) return false;
  const rules = getCustomRules();
  const newRule: CustomRule = {
    id: `rule-${Date.now()}`,
    text: ruleText.trim(),
    createdAt: new Date().toISOString()
  };
  rules.push(newRule);
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CUSTOM_RULES_KEY, JSON.stringify(rules));
    }
  } catch (e) { console.error(e); }
  return newRule;
}

/**
 * Delete a custom rule by ID
 */
export function deleteCustomRule(ruleId: string): boolean {
  let rules = getCustomRules();
  rules = rules.filter(r => r.id !== ruleId);
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CUSTOM_RULES_KEY, JSON.stringify(rules));
    }
  } catch (e) { console.error(e); }
  return true;
}
