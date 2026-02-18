
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth, useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, UserPlus, LogOut, User as UserIcon, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const [loginId, setLoginId] = useState(''); // Email or Username
  const [password, setPassword] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !db) return;
    setLoading(true);
    try {
      let email = loginId.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      
      if (!isEmail) {
        const userMapSnap = await getDoc(doc(db, 'usernames', email.toLowerCase()));
        if (!userMapSnap.exists()) throw new Error("Username not found.");
        email = userMapSnap.data().email;
      }

      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: "Welcome back!" });
      router.push('/');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !db) return;
    setLoading(true);
    try {
      const username = regUsername.trim().toLowerCase();
      const userMapRef = doc(db, 'usernames', username);
      const userMapSnap = await getDoc(userMapRef);
      if (userMapSnap.exists()) throw new Error("Username already taken.");

      const cred = await createUserWithEmailAndPassword(auth, regEmail, password);
      
      await setDoc(userMapRef, { uid: cred.user.uid, email: regEmail.toLowerCase() });
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        username,
        email: regEmail,
        role: 'reader',
        createdAt: serverTimestamp()
      });

      toast({ title: "Welcome to the Lounge!" });
      router.push('/');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Registration failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (isUserLoading) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-md mx-auto">
          {!user || user.isAnonymous ? (
            <Card className="border-none shadow-xl bg-card/80 backdrop-blur rounded-[2rem]">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl font-headline font-black">Entry</CardTitle>
                <CardDescription>Sign in with email or username.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="login">
                  <TabsList className="grid w-full grid-cols-2 mb-8 h-12">
                    <TabsTrigger value="login">Login</TabsTrigger>
                    <TabsTrigger value="register">Join</TabsTrigger>
                  </TabsList>
                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <Input placeholder="Email or Username" value={loginId} onChange={e => setLoginId(e.target.value)} required className="h-12" />
                      <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="h-12" />
                      <Button type="submit" className="w-full h-14 font-black rounded-xl" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" /> : <LogIn className="mr-2" />}
                        Enter Lounge
                      </Button>
                    </form>
                  </TabsContent>
                  <TabsContent value="register">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <Input placeholder="Username" value={regUsername} onChange={e => setRegUsername(e.target.value)} required className="h-12" />
                      <Input type="email" placeholder="Email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required className="h-12" />
                      <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="h-12" />
                      <Button type="submit" className="w-full h-14 font-black rounded-xl" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" /> : <UserPlus className="mr-2" />}
                        Create Account
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-none shadow-xl bg-card/80 backdrop-blur rounded-[2rem]">
              <CardHeader className="text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserIcon className="h-10 w-10 text-primary" />
                </div>
                <CardTitle className="text-2xl font-headline font-black">Logged In</CardTitle>
                <CardDescription>{user.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" className="w-full h-14 text-destructive rounded-xl border-destructive/20" onClick={() => signOut(auth!)}>
                  <LogOut className="mr-2 h-5 w-5" /> Sign Out
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
