import { ChatSession, User } from './types';

const USERS_KEY = 'studyai_users';
const SESSIONS_KEY = 'studyai_sessions';

export const storage = {
  getUsers: (): User[] => {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveUser: (user: User) => {
    const users = storage.getUsers();
    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  findUser: (username: string): User | undefined => {
    return storage.getUsers().find(u => u.username === username);
  },

  getSessions: (username: string): ChatSession[] => {
    const data = localStorage.getItem(SESSIONS_KEY);
    const allSessions: ChatSession[] = data ? JSON.parse(data) : [];
    return allSessions.filter(s => s.userId === username);
  },

  saveSessions: (username: string, sessions: ChatSession[]) => {
    const data = localStorage.getItem(SESSIONS_KEY);
    let allSessions: ChatSession[] = data ? JSON.parse(data) : [];
    
    // Remove old sessions for this user and add new ones
    allSessions = allSessions.filter(s => s.userId !== username).concat(sessions);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(allSessions));
  }
};
