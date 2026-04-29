/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  username: string;
  password: string; // In a real app, this would be hashed
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: Message[];
  isDeleted: boolean;
  updatedAt: number;
}

export interface AppState {
  currentUser: User | null;
  sessions: ChatSession[];
}
