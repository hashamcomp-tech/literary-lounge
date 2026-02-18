"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, UserPlus, LogOut, User as UserIcon, Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !db) return;
    setLoading(true);
    try {
      let email = loginId.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      
      // If it's a username, look up the email in the usernames index
      if (!isEmail) {
        const userMapRef = doc(db, 'usernames', email.toLowerCase());
        const userMapSnap = await getDoc(userMapRef);
        if (!userMapSnap.exists()) {
          throw new Error("Username not found in the Lounge.");
        }
        email = userMapSnap.data().email;
      }

      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: "Welcome back!", description: "Opening your personal shelf." });
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
      
      // 1. Check if username is taken
      const userMapRef = doc(db, 'usernames', username);
      const userMapSnap = await getDoc(userMapRef);
      if (userMapSnap.exists()) {
        throw new Error("This username is already claimed.");
      }

      // 2. Create Auth User
      const cred = await createUserWithEmailAndPassword(auth, regEmail, password);
      
      // 3. Create Username Map
      await setDoc(userMapRef, { 
        uid: cred.user.uid, 
        email: regEmail.toLowerCase() 
      });

      // 4. Create User Profile
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        username,
        email: regEmail,
        role: 'reader',
        createdAt: serverTimestamp()
      });

      toast({ title: "Welcome to the Lounge!", description: "Your account is ready." });
      router.push('/');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Registration failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (isUserLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-md mx-auto">
          {!user || user.isAnonymous ? (
            <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl rounded-[2.5rem] overflow-hidden">
              <div className="h-2 bg-primary w-full" />
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-4xl font-headline font-black">Entry</CardTitle>
                <CardDescription>Join the global library collection.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-8 h-12 bg-muted/50 p-1 rounded-xl">
                    <TabsTrigger value="login" className="rounded-lg font-bold">Login</TabsTrigger>
                    <TabsTrigger value="register" className="rounded-lg font-bold">Join</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Input 
                          placeholder="Email or Username" 
                          value={loginId} 
                          onChange={e => setLoginId(e.target.value)} 
                          required 
                          className="h-14 rounded-2xl bg-muted/20" 
                        />
                        <div className="relative">
                          <Input 
                            type={showPassword ? "text" : "password"} 
                            placeholder="Password" 
                            value={password} 
                            onChange={e => setPassword(e.target.value)} 
                            required 
                            className="h-14 rounded-2xl bg-muted/20 pr-12" 
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </Button>
                        </div>
                      </div>
                      <Button type="submit" className="w-full h-16 font-black rounded-2xl text-lg shadow-xl" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                        Enter Lounge
                      </Button>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="register">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Input 
                          placeholder="Unique Username" 
                          value={regUsername} 
                          onChange={e => setRegUsername(e.target.value)} 
                          required 
                          className="h-14 rounded-2xl bg-muted/20" 
                        />
                        <Input 
                          type="email" 
                          placeholder="Email Address" 
                          value={regEmail} 
                          onChange={e => setRegEmail(e.target.value)} 
                          required 
                          className="h-14 rounded-2xl bg-muted/20" 
                        />
                        <div className="relative">
                          <Input 
                            type={showPassword ? "text" : "password"} 
                            placeholder="Create Password" 
                            value={password} 
                            onChange={e => setPassword(e.target.value)} 
                            required 
                            className="h-14 rounded-2xl bg-muted/20 pr-12" 
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </Button>
                        </div>
                      </div>
                      <Button type="submit" className="w-full h-16 font-black rounded-2xl text-lg shadow-xl bg-primary" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" /> : <UserPlus className="mr-2 h-5 w-5" />}
                        Claim Identity
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl rounded-[2.5rem] overflow-hidden text-center">
              <div className="h-2 bg-primary w-full" />
              <CardHeader>
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <UserIcon className="h-12 w-12 text-primary" />
                </div>
                <CardTitle className="text-3xl font-headline font-black">Logged In</CardTitle>
                <CardDescription className="text-lg font-medium">{user.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pb-10">
                <Button 
                  variant="outline" 
                  className="w-full h-16 text-destructive hover:bg-destructive/10 rounded-2xl border-destructive/20 font-bold" 
                  onClick={() => signOut(auth!)}
                >
                  <LogOut className="mr-2 h-5 w-5" /> Sign Out
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full h-14 rounded-2xl font-bold text-muted-foreground" 
                  onClick={() => router.push('/')}
                >
                  Return to Library
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
