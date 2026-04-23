export type Category = {
  id: string;
  name: string;
  symbol: string;
  color: string;
};

export type TransactionType = "income" | "expense";

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  name: string;
  note?: string;
  categoryId: string;
  date: string;
  createdBy: string;
};

export type AppUser = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
};

export const MOCK_USERS: AppUser[] = [
  { id: "u1", name: "Marcel", initials: "M", avatarColor: "#3b82f6" },
  { id: "u2", name: "Partner", initials: "P", avatarColor: "#ec4899" },
];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "c1", name: "Food & Drink", symbol: "🍔", color: "#f97316" },
  { id: "c2", name: "Transport", symbol: "🚗", color: "#3b82f6" },
  { id: "c3", name: "Housing", symbol: "🏠", color: "#8b5cf6" },
  { id: "c4", name: "Health", symbol: "💊", color: "#ef4444" },
  { id: "c5", name: "Shopping", symbol: "🛍️", color: "#ec4899" },
  { id: "c6", name: "Entertainment", symbol: "🎬", color: "#eab308" },
  { id: "c7", name: "Education", symbol: "📚", color: "#14b8a6" },
  { id: "c8", name: "Salary", symbol: "💼", color: "#22c55e" },
  { id: "c9", name: "Other", symbol: "📋", color: "#6b7280" },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "t1", type: "income", amount: 15000000, name: "April Salary", categoryId: "c8", date: "2026-04-20", createdBy: "u1" },
  { id: "t2", type: "expense", amount: 85000, name: "Lunch at Warung", categoryId: "c1", date: "2026-04-20", createdBy: "u1" },
  { id: "t3", type: "expense", amount: 45000, name: "Grab to office", categoryId: "c2", date: "2026-04-19", createdBy: "u2" },
  { id: "t4", type: "expense", amount: 2500000, name: "Rent April", categoryId: "c3", date: "2026-04-18", createdBy: "u1" },
  { id: "t5", type: "expense", amount: 180000, name: "Movie night", categoryId: "c6", date: "2026-04-17", createdBy: "u2" },
  { id: "t6", type: "expense", amount: 320000, name: "Groceries", categoryId: "c1", date: "2026-04-16", createdBy: "u2" },
  { id: "t7", type: "expense", amount: 75000, name: "Pharmacy", categoryId: "c4", date: "2026-04-15", createdBy: "u1" },
];

export function categoryById(id: string): Category {
  return DEFAULT_CATEGORIES.find((c) => c.id === id) ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
}

export function userById(id: string): AppUser {
  return MOCK_USERS.find((u) => u.id === id) ?? MOCK_USERS[0];
}
