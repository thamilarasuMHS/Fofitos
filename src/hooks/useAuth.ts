import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Gate: don't resolve loading until getSession() has confirmed whether a session exists.
  // Without this, the second effect fires with user=null before getSession() resolves,
  // sets loading=false, and ProtectedRoutes redirects back to /login prematurely.
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Confirm existing session state first — this is the source of truth on page load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setSessionChecked(true);
      }
    });
    // Also react to sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setSessionChecked(true);
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  useEffect(() => {
    // Do not run until getSession() has finished — prevents premature redirect to /login
    if (!sessionChecked) return;

    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (mounted) {
          if (error) setProfile(null);
          else setProfile(data as Profile);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user?.id, sessionChecked]);

  return { user, profile, loading };
}
