import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { MHSLogo } from '@/components/MHSLogo';

export function PendingApproval() {
  const navigate = useNavigate();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="card px-8 py-10 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-5">
            <MHSLogo size={56} />
          </div>

          {/* Clock icon */}
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Pending Review</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Your account has been created and is awaiting approval by an administrator.
            You'll be able to access the app once your role is assigned.
          </p>

          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-6 text-left">
            <p className="text-xs text-amber-700 font-medium mb-1.5">What happens next?</p>
            <ul className="space-y-1 text-xs text-amber-600">
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 font-medium">1.</span>
                Admin reviews your access request
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 font-medium">2.</span>
                Your role will be assigned (Manager / Dietician / Chef)
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 font-medium">3.</span>
                You'll be notified and can sign in to access the system
              </li>
            </ul>
          </div>

          <button type="button" onClick={handleSignOut} className="btn-secondary w-full">
            Sign out
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} My Health School · Fofitos Nutrition
        </p>
      </div>
    </div>
  );
}
