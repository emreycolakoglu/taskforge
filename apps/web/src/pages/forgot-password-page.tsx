import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/hooks/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.auth.forgotPassword(email);
    } catch {
      // Deliberately swallowed — the response is the same either way.
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl p-6 space-y-4 rounded-xl">
        <CardHeader className="text-center space-y-2 p-0">
          <CardTitle className="text-lg font-medium tracking-tight text-foreground">
            Reset Password
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            We'll email you a link to set a new password
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {submitted ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                If an account exists for that email, a reset link is on its way.
              </p>
              <Link to="/login" className="text-sm text-primary hover:underline text-center">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full mt-2">
                {submitting ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:underline text-center"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
