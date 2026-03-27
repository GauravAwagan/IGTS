import React, { useState, useEffect } from 'react';
import { Truck, Mail, Lock, User, ArrowRight, Phone, MapPin, Loader2, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';
import axios from 'axios';

const Login = ({ onLoginSuccess }) => {
  const [view, setView] = useState('login');
  const API_URL = import.meta.env.VITE_API_URL;

  // --- GLOBAL VALIDATION HELPERS ---
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone) => /^\d{10}$/.test(phone);
  const validateName = (name) => /^[a-zA-Z\s]{2,}$/.test(name);
  const validateStrongPassword = (pwd) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(pwd);

  // --- LOGIN FORM ---
  const LoginForm = () => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');

      if (!validateEmail(formData.email)) {
        setError('Please enter a valid email address.');
        return;
      }

      setLoading(true);
      try {
        const response = await axios.post(`${API_URL}/login`, formData);
        const userData = response.data;
        localStorage.setItem('user', JSON.stringify(userData));
        onLoginSuccess(userData);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to login. Please check credentials.');
      } finally {
        setLoading(false);
      }
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="email"
              required
              placeholder="name@example.com"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value.trim().toLowerCase() })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <button
              type="button"
              onClick={() => setView('forgot')}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              Forgot Password?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="password"
              required
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 border border-red-100">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <button
          disabled={loading}
          className="w-full bg-blue-900 hover:bg-blue-800 text-white py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
        </button>

        <div className="text-center text-sm text-gray-500 mt-4">
          Don't have an account?{' '}
          <button type="button" onClick={() => setView('register')} className="text-blue-600 font-bold hover:underline">
            Create account
          </button>
        </div>
      </form>
    );
  };

  // --- REGISTER FORM ---
  const RegisterForm = () => {
    const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '', address: '' });
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    // Realtime Validation
    useEffect(() => {
      setErrors({
        name: formData.name && !validateName(formData.name) ? 'Invalid name (letters only, min 2 chars)' : '',
        email: formData.email && !validateEmail(formData.email) ? 'Invalid email' : '',
        phone: formData.phone && !validatePhone(formData.phone) ? 'Phone must be 10 digits' : '',
        password: formData.password && !validateStrongPassword(formData.password)
          ? 'Password must be 8+ chars, include uppercase, lowercase, number, special char'
          : '',
        confirmPassword: formData.confirmPassword && formData.confirmPassword !== formData.password ? 'Passwords do not match' : '',
        address: formData.address && formData.address.trim().length < 5 ? 'Address too short' : ''
      });
    }, [formData]);

    const isFormValid = Object.values(errors).every((e) => !e) &&
                        Object.values(formData).every((v) => v !== '');

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!isFormValid) return;

      setLoading(true);
      try {
        const response = await axios.post(`${API_URL}/register`, { ...formData, role: 'sender' });
        const newUser = response.data;
        localStorage.setItem('user', JSON.stringify(newUser));
        onLoginSuccess(newUser);
      } catch (err) {
        alert(err.response?.data?.error || 'Registration failed.');
      } finally {
        setLoading(false);
      }
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
        <div className="space-y-3">
          <div className="relative">
            <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              required
              type="text"
              placeholder="Full Name"
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.name}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                setFormData({ ...formData, name: val });
              }}
            />
            {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              required
              type="email"
              placeholder="Email"
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value.trim().toLowerCase() })}
            />
            {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
          </div>

          <div className="relative">
            <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              required
              type="tel"
              maxLength="10"
              placeholder="10-Digit Mobile"
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
            />
            {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                required
                type="password"
                placeholder="Password"
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              {errors.password && <p className="text-red-600 text-xs mt-1">{errors.password}</p>}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                required
                type="password"
                placeholder="Confirm Password"
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              />
              {errors.confirmPassword && <p className="text-red-600 text-xs mt-1">{errors.confirmPassword}</p>}
            </div>
          </div>

          <div className="relative">
            <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              required
              type="text"
              placeholder="Complete Address"
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
            {errors.address && <p className="text-red-600 text-xs mt-1">{errors.address}</p>}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !isFormValid}
          className="w-full bg-blue-900 hover:bg-blue-800 text-white py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><User className="w-4 h-4" /> Create Account</>}
        </button>

        <div className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <button type="button" onClick={() => setView('login')} className="text-blue-600 font-bold hover:underline">
            Login here
          </button>
        </div>
      </form>
    );
  };

  // --- FORGOT PASSWORD FORM ---
  const ForgotPasswordForm = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!validateEmail(email)) {
        setError('Please enter a valid email address.');
        return;
      }

      setLoading(true);
      setError('');

      try {
        await axios.post(`${API_URL}/forgot-password`, { email });
        setSent(true);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to send email. Please check the address.');
      } finally {
        setLoading(false);
      }
    };

    if (sent) {
      return (
        <div className="text-center space-y-4 animate-fade-in py-4">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-gray-800">Check your inbox</h3>
          <p className="text-sm text-gray-500">
            We have sent an email to <b>{email}</b> with reset instructions.
          </p>
          <button onClick={() => setView('login')} className="text-blue-600 font-bold hover:underline flex items-center justify-center gap-2 mt-4">
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </button>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
        <p className="text-sm text-gray-500 mb-4">
          Enter your registered email address and we'll send you a link to reset your password.
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="email"
              required
              placeholder="name@example.com"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 border border-red-100">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <button
          disabled={loading}
          className="w-full bg-blue-900 hover:bg-blue-800 text-white py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
        </button>
        <button type="button" onClick={() => setView('login')} className="w-full text-gray-500 text-sm font-bold hover:text-gray-700 py-2">
          Cancel
        </button>
      </form>
    );
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center relative"
      style={{ backgroundImage: "url('https://images.unsplash.com/photo-1519003722824-194d4455a60c?q=80&w=2075&auto=format&fit=crop')" }}
    >
      <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-[2px] z-0"></div>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 animate-slide-up relative z-10">
        <div className="bg-blue-900 p-6 text-white text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Truck className="w-10 h-10" />
            <h1 className="text-3xl font-bold tracking-tight">IGTS</h1>
          </div>
          <p className="text-blue-100/80 text-sm">Intercity Goods Transportation System</p>
        </div>

        <div className="p-6 md:p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            {view === 'register' ? 'Create Account' : view === 'forgot' ? 'Reset Password' : 'Welcome Back'}
          </h2>
          {view === 'login' && <LoginForm />}
          {view === 'register' && <RegisterForm />}
          {view === 'forgot' && <ForgotPasswordForm />}
        </div>
      </div>
    </div>
  );
};

export default Login;