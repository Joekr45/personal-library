import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BookOpen, Library, AlertTriangle, User, Mail, Lock, Eye, EyeOff } from 'lucide-react';

// The sign-in / create-account screen.
// (Moved out of App.jsx; it receives the App state and actions it uses as props.)
export default function AuthScreen({ authDisplayName, authEmail, authError, authMode, authPassword, family, handleAuthSubmit, hasUsers, inviteCode, isAuthSubmitting, setAuthDisplayName, setAuthEmail, setAuthError, setAuthMode, setAuthPassword, setInviteCode, setShowPassword, showPassword, signupMode }) {
  return (
    <div className="min-h-screen w-full bg-[#1e2f26] text-white flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-amber-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-2xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-full bg-orange-600 border-2 border-amber-500 text-amber-400 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Personal Library</h1>
          <p className="text-xs text-slate-400">
            {authMode === 'login' ? 'Sign in with your email to access your personal shelves' : 'Create a family member profile with your email'}
          </p>
        </div>

        {signupMode !== 'closed' && <div className="flex bg-slate-800/80 p-1 rounded-2xl border border-slate-700/60 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setAuthError(''); }}
            className={`flex-1 py-2 rounded-xl transition-all ${
              authMode === 'login' ? 'bg-amber-500 text-[#1e2f26] shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('register'); setAuthError(''); }}
            className={`flex-1 py-2 rounded-xl transition-all ${
              authMode === 'register' ? 'bg-amber-500 text-[#1e2f26] shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>}

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          {authMode === 'register' && hasUsers && signupMode === 'invite' && (
            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Invite Code
              </label>
              <input
                type="text"
                required
                autoCapitalize="characters"
                autoComplete="off"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. K7QP-3MZD"
                className="w-full px-4 py-2.5 bg-slate-800/90 text-sm font-mono tracking-widest text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 transition-colors uppercase"
              />
              <p className="text-[10px] text-slate-500 mt-1">Ask the library's owner for a code.</p>
            </div>
          )}
          {authMode === 'register' && (
            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Full Name / Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  value={authDisplayName}
                  onChange={(e) => setAuthDisplayName(e.target.value)}
                  placeholder="e.g. Alex, Mom, John"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 text-xs text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="e.g. name@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 text-xs text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder={authMode === 'register' ? 'At least 8 characters' : '••••••••'}
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-800/90 text-xs text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-orange-500 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {authError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthSubmitting}
            className="w-full py-3 disabled:opacity-60 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-[#1e2f26] text-xs font-bold rounded-xl shadow-lg shadow-orange-500/25 transition-all mt-2"
          >
            {isAuthSubmitting ? 'One moment…' : authMode === 'login' ? 'Sign In to My Library' : 'Create My Account & Enter'}
          </button>
        </form>

        {!hasUsers && (
          <div className="pt-4 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400">
              Welcome! No accounts exist yet. The first account you create becomes the library's owner.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
