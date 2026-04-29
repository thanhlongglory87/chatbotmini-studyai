/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Mic, 
  MicOff, 
  Trash2, 
  RotateCcw, 
  Plus, 
  LogOut, 
  MessageSquare, 
  Menu, 
  X,
  History,
  Trash,
  Smile,
  AlertCircle,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { User, ChatSession, Message } from './types';
import { storage } from './lib/storage';
import { chatWithAI } from './lib/gemini';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const playSuccessSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {
    console.warn('Audio context failed', e);
  }
};

// Custom hook for speech recognition
const useSpeechToText = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'vi-VN';

      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  return { isListening, transcript, toggleListening };
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthMode, setIsAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { isListening, transcript, toggleListening } = useSpeechToText();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (transcript) {
      setInputValue(prev => prev + ' ' + transcript);
    }
  }, [transcript]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, isThinking]);

  // Handle Login
  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Vui lòng điền đầy đủ thông tin!');
      return;
    }

    if (isAuthMode === 'register') {
      if (storage.findUser(username)) {
        setError('Tên tài khoản đã tồn tại!');
        return;
      }
      storage.saveUser({ username, password });
      setIsAuthMode('login');
      setError('Đăng ký thành công! Mời bạn đăng nhập.');
    } else {
      const foundUser = storage.findUser(username);
      if (foundUser && foundUser.password === password) {
        setUser(foundUser);
        playSuccessSound();
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#FBBF24', '#F472B6', '#6366F1', '#10B981']
        });
        
        // Load sessions
        const loadedSessions = storage.getSessions(username);
        setSessions(loadedSessions);
        
        // If no sessions, create the first one
        if (loadedSessions.length === 0) {
          createNewSession(username);
        } else {
          const activeSessions = loadedSessions.filter(s => !s.isDeleted);
          if (activeSessions.length > 0) {
            setCurrentSessionId(activeSessions[0].id);
          } else {
            createNewSession(username);
          }
        }
      } else {
        setError('Tên tài khoản hoặc mật khẩu không đúng!');
      }
    }
  };

  const createNewSession = (uName: string) => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      userId: uName,
      title: 'Cuộc trò chuyện mới',
      messages: [{
        id: 'welcome',
        role: 'assistant',
        content: `Chào **${uName}** yêu! Tớ có thể giúp bạn trả lời các câu hỏi về học tập. Cần gì hỏi tớ nhé? 🥳`,
        timestamp: Date.now()
      }],
      isDeleted: false,
      updatedAt: Date.now()
    };
    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);
    setCurrentSessionId(newSession.id);
    storage.saveSessions(uName, updatedSessions);
  };

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !selectedImage) || isThinking || !user || !currentSessionId) return;

    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (!currentSession) return;

    let content = inputValue;
    if (selectedImage) {
      // For the UI display, we'll append a markdown image or indicator
      content = inputValue + "\n\n![Image Attachment](" + selectedImage + ")";
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content,
      timestamp: Date.now()
    };

    const newMessages = [...currentSession.messages, userMessage];
    const updatedSessions = sessions.map(s => 
      s.id === currentSessionId 
        ? { ...s, messages: newMessages, updatedAt: Date.now() } 
        : s
    );

    setSessions(updatedSessions);
    setInputValue('');
    setSelectedImage(null);
    setIsThinking(true);

    try {
      let assistantResponse = '';
      // We pass the messages. Note: current implementation of chatWithAI only handles text.
      // In a real app, we'd pass base64 image data to the AI.
      await chatWithAI(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        (chunk) => {
          assistantResponse = chunk;
          setSessions(prev => prev.map(s => 
            s.id === currentSessionId 
              ? { 
                  ...s, 
                  messages: [
                    ...newMessages, 
                    { id: 'thinking', role: 'assistant', content: assistantResponse, timestamp: Date.now() }
                  ]
                } 
              : s
          ));
        }
      );

      // Finalize assistant message
      const finalAssistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantResponse,
        timestamp: Date.now()
      };

      const finalSessions = sessions.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages: [...newMessages, finalAssistantMessage], updatedAt: Date.now() } 
          : s
      );
      setSessions(finalSessions);
      storage.saveSessions(user.username, finalSessions);
    } catch (err) {
      console.error(err);
    } finally {
      setIsThinking(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setUsername('');
    setPassword('');
    setSessions([]);
    setCurrentSessionId(null);
  };

  const deleteSession = (id: string) => {
    const updated = sessions.map(s => s.id === id ? { ...s, isDeleted: true } : s);
    setSessions(updated);
    storage.saveSessions(user!.username, updated);
    if (currentSessionId === id) {
      const remaining = updated.filter(s => !s.isDeleted);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const restoreSession = (id: string) => {
    const updated = sessions.map(s => s.id === id ? { ...s, isDeleted: false } : s);
    setSessions(updated);
    storage.saveSessions(user!.username, updated);
  };

  const permanentlyDeleteSession = (id: string) => {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    storage.saveSessions(user!.username, updated);
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-100 via-amber-200 to-orange-300 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[32px] shadow-2xl w-full max-w-md border-4 border-amber-200"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg mx-auto mb-4">
              <span>🎓</span>
            </div>
            <h1 className="text-4xl font-bold text-amber-900 mb-2">StudyAI</h1>
            <p className="text-amber-700 italic font-medium">Trợ lí học tập thông minh ✨</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-amber-900 ml-1">Tên tài khoản</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-3 rounded-2xl bg-amber-50 border-2 border-amber-100 focus:outline-none focus:border-amber-400 focus:bg-white transition-all"
                placeholder="Nhập tên tài khoản..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-amber-900 ml-1">Mật khẩu</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-3 rounded-2xl bg-amber-50 border-2 border-amber-100 focus:outline-none focus:border-amber-400 focus:bg-white transition-all"
                placeholder="Nhập mật khẩu..."
              />
            </div>

            {error && (
              <p className={cn("text-sm font-bold p-3 rounded-xl flex items-center gap-2", 
                error.includes('thành công') ? "text-emerald-700 bg-emerald-50" : "text-rose-600 bg-rose-50")}>
                <AlertCircle className="w-4 h-4" /> {error}
              </p>
            )}

            <button 
              type="submit"
              className="w-full bg-amber-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-amber-600 active:scale-[0.98] transition-all shadow-lg shadow-amber-200 uppercase tracking-wide"
            >
              {isAuthMode === 'login' ? 'Đăng Nhập' : 'Đăng Ký'}
            </button>
          </form>

          <div className="mt-8 text-center text-sm">
            <button 
              onClick={() => setIsAuthMode(prev => prev === 'login' ? 'register' : 'login')}
              className="transition-colors"
            >
              {isAuthMode === 'login' ? (
                <>
                  <span className="text-black font-normal">Chưa có tài khoản? </span>
                  <span className="text-amber-800 font-bold underline decoration-2 underline-offset-4">Đăng ký ngay!</span>
                </>
              ) : (
                <>
                  <span className="text-black font-normal">Đã có tài khoản? </span>
                  <span className="text-amber-800 font-bold underline decoration-2 underline-offset-4">Đăng nhập thôi!</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-yellow-50 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-amber-900/20 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        className={cn(
          "fixed lg:static inset-y-0 left-0 w-72 bg-amber-100 border-r border-amber-200 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 border-b border-amber-200/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white text-xl shadow-md font-bold">
              🎓
            </div>
            <h1 className="text-xl font-bold text-amber-900">StudyAI</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-amber-200 rounded-lg transition-colors">
            <X className="w-6 h-6 text-amber-700" />
          </button>
        </div>

        <div className="p-4">
          <button 
            onClick={() => createNewSession(user.username)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border-2 border-amber-400 text-amber-700 font-bold hover:bg-amber-50 transition-all shadow-sm active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" /> Chat mới
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-3 py-2">
          <div className="flex items-center justify-between px-2 mb-2">
            <button 
              onClick={() => setShowTrash(false)}
              className={cn("flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest transition-colors", !showTrash ? "text-amber-800" : "text-amber-400")}
            >
              <History className="w-3.5 h-3.5" /> Lịch sử
            </button>
            <button 
              onClick={() => setShowTrash(true)}
              className={cn("flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest transition-colors", showTrash ? "text-amber-800" : "text-amber-400")}
            >
              <Trash className="w-3.5 h-3.5" /> Thùng rác
            </button>
          </div>

          <AnimatePresence mode="popLayout">
            {sessions
              .filter(s => s.isDeleted === showTrash)
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map(session => (
                <motion.div
                  layout
                  key={session.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2",
                    currentSessionId === session.id 
                      ? "bg-white border-amber-300 shadow-sm" 
                      : "bg-white/40 border-transparent hover:bg-white/70"
                  )}
                  onClick={() => {
                    if (!showTrash) setCurrentSessionId(session.id);
                  }}
                >
                  <span className="text-lg shrink-0">
                    {session.title.includes('toán') ? '📐' : session.title.includes('văn') ? '✍️' : '💬'}
                  </span>
                  <span className={cn(
                    "flex-1 text-sm font-semibold truncate",
                    currentSessionId === session.id ? "text-amber-900" : "text-amber-800/70"
                  )}>
                    {session.title === 'Cuộc trò chuyện mới' && session.messages.length > 1 ? session.messages[1].content.slice(0, 30) : session.title}
                  </span>
                  
                  {!showTrash ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="flex gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); restoreSession(session.id); }}
                        className="p-1.5 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-all"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); permanentlyDeleteSession(session.id); }}
                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
          </AnimatePresence>
        </div>

        <div className="p-4 border-t border-amber-200">
          <div className="bg-white/40 rounded-2xl p-3 flex items-center gap-3 border border-amber-200/50">
            <div className="w-9 h-9 rounded-full bg-pink-400 flex items-center justify-center text-lg ring-2 ring-white shadow-sm shrink-0">
              👧
            </div>
            <div className="flex-1 truncate">
              <p className="font-bold text-sm text-gray-800 truncate">{user.username}</p>
              <p className="text-[10px] font-bold text-amber-600 tracking-wider">THÀNH VIÊN VIP</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-rose-50 text-rose-500 rounded-xl transition-all"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 lg:px-8 bg-white/50 backdrop-blur-md border-b border-gray-100 shrink-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-amber-100 rounded-xl transition-colors"
            >
              <Menu className="w-6 h-6 text-amber-700" />
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <span className="text-sm font-bold text-gray-600 tracking-wide uppercase">AI ĐANG TRỰC TUYẾN</span>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8 scroll-smooth">
          <AnimatePresence mode="popLayout">
            {currentSession?.messages.map((msg, idx) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn(
                  "flex gap-4 max-w-[90%] lg:max-w-[75%]",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-sm ring-2 ring-white",
                  msg.role === 'user' 
                    ? "bg-pink-400" 
                    : "bg-indigo-500"
                )}>
                  {msg.role === 'user' ? '👧' : '🤖'}
                </div>
                <div className={cn(
                  "p-5 rounded-[24px] shadow-sm relative",
                  msg.role === 'user' 
                    ? "bg-blue-500 text-white rounded-tr-none" 
                    : "bg-white text-gray-800 rounded-tl-none border border-gray-100"
                )}>
                  <div className={cn(
                    "markdown-body text-sm lg:text-[15px] leading-relaxed",
                    msg.role === 'user' ? "[&_p]:text-white" : ""
                  )}>
                    <ReactMarkdown 
                      remarkPlugins={[remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  {msg.id === 'thinking' && (
                    <span className="inline-block mt-2 w-2 h-4 bg-gray-300 animate-pulse rounded-full" />
                  )}
                  <p className={cn(
                    "text-[10px] mt-3 font-bold opacity-50 uppercase tracking-widest",
                    msg.role === 'user' ? "text-white" : "text-gray-400"
                  )}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

        {/* Action Area */}
        <div className="p-6 bg-transparent relative z-10">
          <div className="max-w-4xl mx-auto space-y-4">
            {selectedImage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative inline-block"
              >
                <img src={selectedImage} alt="Preview" className="h-20 w-20 object-cover rounded-xl border-2 border-amber-300 shadow-md" />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 bg-rose-500 text-white p-1 rounded-full shadow-lg"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
            
            <div className="bg-white p-2 rounded-[28px] shadow-xl shadow-amber-200/20 border-2 border-amber-200 flex items-end gap-1">
              <input 
                type="file" 
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setSelectedImage(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-gray-400 hover:text-amber-500 transition-colors"
                title="Đính kèm ảnh"
              >
                <ImageIcon className="w-6 h-6" />
              </button>
              <button 
                onClick={toggleListening}
                className={cn(
                  "p-3 rounded-full transition-all",
                  isListening ? "bg-red-500 text-white animate-pulse" : "text-gray-400 hover:text-amber-500"
                )}
                title="Sử dụng mic"
              >
                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              <textarea
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isThinking}
                placeholder={isThinking ? "Đang suy nghĩ..." : "Hỏi StudyAI bất cứ điều gì..."}
                className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-2 resize-none text-gray-700 font-medium placeholder:text-gray-300 scrollbar-hide"
                style={{ maxHeight: '150px' }}
              />
              
              <button 
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isThinking}
                className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 text-white font-bold py-3 px-6 rounded-2xl shadow-lg shadow-amber-200 transition-all flex items-center gap-2 group active:scale-95"
              >
                GỬI <span className="group-hover:translate-x-1 transition-transform">➔</span>
              </button>
            </div>
            
            <p className="text-center text-[11px] text-gray-400 mt-4 flex items-center justify-center gap-1.5 font-bold tracking-tight">
              StudyAI có thể mắc sai sót. Hãy kiểm chứng thông tin 😊
            </p>
          </div>
        </div>

        {/* Flare Background Elements */}
        <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-amber-200/20 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute bottom-[-100px] left-[200px] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl pointer-events-none -z-10" />
      </main>
    </div>
  );
}
