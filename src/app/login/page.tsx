
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, UserPlus, LogOut, User as UserIcon, Check, X, KeyRound, Pencil, Clock, Shield, History, ChevronRight } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const profileRef = useMemoFirebase(() => (user && !user.isAnonymous) ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile, isLoading: isProfileLoading } = useDoc(profileRef);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  
  const [resetEmail, setResetEmail] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);
  
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [loading, setLoading] = useState(false);

  // Username change states
  const [newUsername, setNewUsername] = useState('');
  const [isChangingUsername, setIsChangingUsername] = useState(false);

  // Administrative Check
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || profile?.role === 'admin';

  useEffect(() => {
    const checkUsername = async () => {
      const clean = registerUsername.trim().toLowerCase();
      if (clean.length < 3) {
        setUsernameStatus('idle');
        return;
      }

      setUsernameStatus('checking');
      try {
        const usernameRef = doc(db, 'usernames', clean);
        const snapshot = await getDoc(usernameRef);
        setUsernameStatus(snapshot.exists() ? 'taken' : 'available');
      } catch (err) {
        setUsernameStatus('idle');
      }
    };

    const debounce = setTimeout(checkUsername, 500);
    return () => clearTimeout(debounce);
  }, [registerUsername, db]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !db) return;
    setLoading(true);
    try {
      let emailToUse = loginEmail.trim();
      
      // Simple check to see if input is an email or a username
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse);
      
      if (!isEmail) {
        // Assume it's a username, find the email associated with it
        const usernameRef = doc(db, 'usernames', emailToUse.toLowerCase());
        const usernameSnap = await getDoc(usernameRef);
        
        if (!usernameSnap.exists()) {
          throw new Error("Username not found. Please use your registered email or correct username.");
        }
        
        const { uid } = usernameSnap.data();
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists() || !userDocSnap.data()?.email) {
          throw new Error("Could not find account details for this username.");
        }
        
        emailToUse = userDocSnap.data()!.email;
      }

      await signInWithEmailAndPassword(auth, emailToUse, loginPassword);
      toast({ title: "Welcome back!", description: "Successfully logged in." });
      router.push('/');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = registerUsername.trim().toLowerCase();
    
    setLoading(true);
    try {
      // 1. Check uniqueness (Read operation)
      const usernameRef = doc(db, 'usernames', cleanUsername);
      const usernameSnap = await getDoc(usernameRef);
      if (usernameSnap.exists()) {
        toast({ variant: "destructive", title: "Username Taken", description: "Please choose another username." });
        setLoading(false);
        return;
      }

      // 2. Create Auth User (Wait for result to get UID)
      const userCredential = await createUserWithEmailAndPassword(auth, registerEmail, registerPassword);
      const newUser = userCredential.user;
      
      // 3. Initiate Firestore Mutations (NON-BLOCKING)
      
      // A. Username Map
      const mapData = { uid: newUser.uid };
      setDoc(usernameRef, mapData).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: usernameRef.path,
          operation: 'create',
          requestResourceData: mapData,
        }));
      });

      // B. User Profile
      const userRef = doc(db, 'users', newUser.uid);
      const profileData = {
        uid: newUser.uid,
        username: cleanUsername,
        email: newUser.email,
        role: 'reader', // Assign requested 'reader' role
        createdAt: serverTimestamp(),
        lastUsernameChange: serverTimestamp() // Set initial change timestamp
      };

      setDoc(userRef, profileData).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: userRef.path,
          operation: 'create',
          requestResourceData: profileData,
        }));
      });

      toast({ title: "Account created!", description: `Welcome to the Literary Lounge, ${cleanUsername}!` });
      router.push('/');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Registration failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newUsername.trim().toLowerCase();
    if (!clean || clean === profile?.username) {
      setIsChangingUsername(false);
      return;
    }

    setLoading(true);
    try {
      // 30 day limit calculation - Bypassed for Admins
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const lastChange = profile?.lastUsernameChange;
      
      if (!isAdmin && lastChange) {
        const lastChangeMillis = lastChange.toMillis ? lastChange.toMillis() : new Date(lastChange).getTime();
        const now = Date.now();
        if (now - lastChangeMillis < thirtyDays) {
          const timeLeft = thirtyDays - (now - lastChangeMillis);
          const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
          
          toast({ 
            variant: "destructive", 
            title: "Policy Restriction", 
            description: `You can change your username again in about ${daysLeft} day(s).` 
          });
          setLoading(false);
          return;
        }
      }

      const usernameRef = doc(db, 'usernames', clean);
      const snapshot = await getDoc(usernameRef);

      if (snapshot.exists()) {
        toast({ variant: "destructive", title: "Error", description: "Username already taken." });
        setLoading(false);
        return;
      }

      const mapData = { uid: user!.uid };
      setDoc(usernameRef, mapData).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: usernameRef.path,
          operation: 'create',
          requestResourceData: mapData
        }));
      });

      const oldUsername = profile?.username;
      const userRef = doc(db, 'users', user!.uid);
      const updateData = {
        username: clean,
        lastUsernameChange: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      updateDoc(userRef, updateData).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: userRef.path,
          operation: 'update',
          requestResourceData: updateData
        }));
      });

      if (oldUsername) {
        deleteDoc(doc(db, 'usernames', oldUsername)).catch(() => {});
      }

      toast({ title: "Success", description: "Your username has been updated." });
      setIsChangingUsername(false);
      setNewUsername('');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      toast({ 
        title: "Reset link sent!", 
        description: `Check your email (${resetEmail}) for password reset instructions.` 
      });
      setShowResetDialog(false);
      setResetEmail('');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    toast({ title: "Signed out", description: "Come back soon!" });
  };

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const isAnonymous = !user || user.isAnonymous;

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-md mx-auto">
          {isAnonymous ? (
            <Card className="border-none shadow-xl bg-card/80 backdrop-blur">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl font-headline font-black">Welcome</CardTitle>
                <CardDescription>Sign in to sync your library across devices.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-8">
                    <TabsTrigger value="login">Login</TabsTrigger>
                    <TabsTrigger value="register">Register</TabsTrigger>
                  </TabsList>
                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <Input placeholder="Email or Username" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                      <Input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                      
                      <div className="flex justify-end">
                        <Button 
                          variant="link" 
                          type="button" 
                          size="sm" 
                          onClick={() => setShowResetDialog(true)}
                          className="px-0 h-auto text-muted-foreground hover:text-primary"
                        >
                          Forgot password?
                        </Button>
                      </div>

                      <Button type="submit" className="w-full py-6 text-lg rounded-xl" disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                        Sign In
                      </Button>
                    </form>
                  </TabsContent>
                  <TabsContent value="register">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="relative">
                        <Input 
                          placeholder="Unique Username" 
                          value={registerUsername} 
                          onChange={(e) => setRegisterUsername(e.target.value)} 
                          required 
                          className={usernameStatus === 'available' ? 'border-green-500' : usernameStatus === 'taken' ? 'border-destructive' : ''}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {usernameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          {usernameStatus === 'available' && <Check className="h-4 w-4 text-green-500" />}
                          {usernameStatus === 'taken' && <X className="h-4 w-4 text-destructive" />}
                        </div>
                      </div>
                      <Input type="email" placeholder="Email" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} required />
                      <Input type="password" placeholder="Password" value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} required />
                      <Button type="submit" className="w-full py-6 text-lg rounded-xl" disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking'}>
                        {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserPlus className="mr-2 h-5 w-5" />}
                        Create Account
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-none shadow-xl bg-card/80 backdrop-blur">
              <CardHeader className="text-center">
                <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                  <UserIcon className="h-10 w-10 text-primary" />
                  {isAdmin && (
                    <div className="absolute -bottom-1 -right-1 bg-primary text-white p-1 rounded-full border-2 border-background">
                      <Shield className="h-3 w-3" />
                    </div>
                  )}
                </div>
                <CardTitle className="text-2xl font-headline font-bold flex flex-col items-center justify-center gap-2">
                  <span>{isProfileLoading ? "Loading..." : (profile?.username || "Your Account")}</span>
                  {profile?.role === 'admin' && (
                    <span className="admin-badge">Admin</span>
                  )}
                  {profile?.role === 'reader' && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-none uppercase text-[10px]">Reader</Badge>
                  )}
                </CardTitle>
                <CardDescription>{user.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account & Activity</Label>
                  
                  <div className="space-y-3">
                    <Link href="/history">
                      <Button 
                        variant="outline" 
                        className="w-full justify-between h-12 rounded-xl border-muted"
                      >
                        <div className="flex items-center gap-3">
                          <History className="h-4 w-4 text-primary" />
                          <span>Reading History</span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </Link>

                    {!isChangingUsername ? (
                      <div className="space-y-3">
                        <Button 
                          variant="outline" 
                          className="w-full justify-between h-12 rounded-xl border-muted"
                          onClick={() => {
                            setIsChangingUsername(true);
                            setNewUsername(profile?.username || '');
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <UserIcon className="h-4 w-4 text-primary" />
                            <span>Change Username</span>
                          </div>
                          <Pencil className="h-3.5 w-3.5 opacity-50" />
                        </Button>
                        
                        {isAdmin ? (
                          <p className="text-[10px] text-primary flex items-center gap-1.5 px-1 font-bold">
                            <Shield className="h-3 w-3" /> Administrator: Instant username changes enabled.
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 px-1">
                            <Clock className="h-3 w-3" /> Usernames can be changed once every 30 days.
                          </p>
                        )}
                      </div>
                    ) : (
                      <form onSubmit={handleUpdateUsername} className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-1">
                          <Label htmlFor="new-username" className="text-xs">New Username</Label>
                          <Input 
                            id="new-username"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                            placeholder="Enter unique username"
                            className="rounded-xl h-11"
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            className="flex-1 rounded-xl"
                            onClick={() => setIsChangingUsername(false)}
                            disabled={loading}
                          >
                            Cancel
                          </Button>
                          <Button 
                            type="submit" 
                            className="flex-1 rounded-xl"
                            disabled={loading || !newUsername.trim() || newUsername.trim() === profile?.username}
                          >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>

                <Separator />

                <Button variant="outline" className="w-full py-6 text-lg text-destructive hover:bg-destructive/5 rounded-xl border-destructive/20" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-5 w-5" /> Sign Out
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Reset Password
            </CardTitle>
            <DialogDescription>
              Enter your registered email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="name@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="w-full py-6 rounded-xl"
              onClick={handlePasswordReset}
              disabled={loading || !resetEmail}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Send Reset Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
