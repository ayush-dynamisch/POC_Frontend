import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Role } from '../types';
import { authApi, type LoginAccount } from '../services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  switchRole: (role: Role) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Real seeded accounts from backend database
export const ROLE_ACCOUNTS: Record<Role, { email: string; password: string; name: string; orgName: string }> = {
  compliance_officer: {
    email: 'org_1_compliance@example.com',
    password: '12345678',
    name: 'Org 1 Compliance Officer',
    orgName: 'Org 1 Healthcare System'
  },
  admin: {
    email: 'org_1_admin@example.com',
    password: '12345678',
    name: 'Org 1 Admin',
    orgName: 'Org 1 Healthcare System'
  },
  super_admin: {
    email: 'ayush.amberkar@dynamisch.co',
    password: '12345678',
    name: 'Platform Super Admin',
    orgName: 'Platform Central'
  },
  hr: {
    email: 'org_1_hr@example.com',
    password: '12345678',
    name: 'Org 1 HR Specialist',
    orgName: 'Org 1 Healthcare System'
  },
  clinician: {
    email: 'org_1_nurse@example.com',
    password: '12345678',
    name: 'Org 1 Nurse',
    orgName: 'Org 1 Healthcare System'
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const accountToUser = (account: LoginAccount): User => ({
    id: account.user_id,
    name: account.name || account.email.split('@')[0],
    email: account.email,
    role: account.role as Role,
    organizationName: account.org_id ? 'Org 1 Healthcare System' : 'Platform Central',
    orgId: account.org_id || '9eb9dedb-5433-4d45-9479-23eb965a8427'
  });

  useEffect(() => {
    const initAuth = async () => {
      const stored = authApi.getStoredAccount();
      const token = localStorage.getItem('mediverify_token');

      if (stored && token) {
        setUser(accountToUser(stored));
        setIsLoading(false);
      } else {
        // Auto-login with default seeded compliance officer so app is immediately usable
        try {
          const res = await authApi.login('org_1_compliance@example.com', '12345678');
          setUser(accountToUser(res.account));
        } catch (err) {
          console.error('Initial auto-login failed:', err);
        } finally {
          setIsLoading(false);
        }
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await authApi.login(email, password);
      setUser(accountToUser(res.account));
      return true;
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
  };

  const switchRole = async (role: Role) => {
    const creds = ROLE_ACCOUNTS[role];
    if (!creds) return;
    try {
      const res = await authApi.login(creds.email, creds.password);
      setUser(accountToUser(res.account));
    } catch (err) {
      console.error('Switch role login failed:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        switchRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
