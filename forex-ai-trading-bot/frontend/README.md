# NiveshAI Guard - Modern Trading Dashboard UI

## Brand-Level & Industry-Level Modern Theme

A premium, dark-themed trading dashboard built with **Next.js 14**, **TypeScript**, **Tailwind CSS**, and **Shadcn-style components**.

### Design Philosophy
- **Dark Premium Theme**: Deep navy/slate backgrounds with subtle gradients
- **Glassmorphism**: Frosted glass cards with backdrop blur effects
- **Gradient Accents**: Blue-to-purple gradient highlights
- **Modern Animations**: Smooth transitions, hover effects, shimmer loading
- **Industry Standard**: Professional trading console layout (sidebar + main content)

---

## Features

| Feature | Description |
|---------|-------------|
| Authentication | JWT-based auth with auto-refresh, Zustand state management |
| Dashboard | Real-time metrics, risk status, system health monitoring |
| Signals | AI signal center with approval workflow, confidence scoring |
| Trades | Open positions, trade history, performance analytics |
| Backtest | Strategy validation engine with historical data |
| Admin Panel | Mode control, kill switch, risk config, audit logs, user management |
| Responsive | Mobile-first design with collapsible sidebar |
| Dark Mode | Native dark theme throughout the application |

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3.4 + Custom CSS variables
- **State**: Zustand (lightweight state management)
- **HTTP**: Axios with interceptors
- **Icons**: Lucide React
- **Charts**: Recharts (ready for integration)
- **Animations**: Tailwind animate + Custom keyframes

---

## Project Structure

```
tradingbot-ui/
├── app/
│   ├── globals.css          # Global styles, custom properties, animations
│   ├── layout.tsx           # Root layout with providers
│   ├── login/
│   │   └── page.tsx         # Login page with glassmorphism design
│   └── dashboard/
│       ├── layout.tsx       # Dashboard shell with sidebar
│       ├── page.tsx         # Main dashboard (metrics, risk, health)
│       ├── admin/
│       │   └── page.tsx     # Admin panel (mode, kill switch, logs)
│       ├── signals/
│       │   └── page.tsx     # Signal center (AI analysis, approval)
│       ├── trades/
│       │   └── page.tsx     # Trade history & performance
│       └── backtest/
│           └── page.tsx     # Backtesting engine
├── components/
│   ├── providers.tsx        # Auth provider with auto-refresh
│   └── ui/                  # UI components (if needed)
├── hooks/
│   └── useAuth.ts           # Authentication store (Zustand)
├── lib/
│   ├── api.ts               # API client with interceptors
│   └── utils.ts             # Utility functions (formatting, cn)
├── types/
│   └── index.ts             # TypeScript interfaces
├── tailwind.config.ts       # Tailwind configuration
├── next.config.js           # Next.js configuration
└── package.json             # Dependencies
```

---

## Installation

```bash
# 1. Copy the tradingbot-ui folder into your project
cp -r tradingbot-ui/* your-project/frontend/

# 2. Install dependencies
cd your-project/frontend
npm install

# 3. Set environment variables
cp .env.example .env
# Edit .env and set:
# NEXT_PUBLIC_API_URL=http://localhost:5000

# 4. Run development server
npm run dev

# 5. Build for production
npm run build
```

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## Integration with Existing Backend

This UI is designed to work seamlessly with your existing **Node.js/Express backend**:

### API Routes Expected:

**Auth:**
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

**Dashboard:**
- `GET /api/dashboard/overview`
- `GET /api/dashboard/market-overview`
- `GET /api/dashboard/performance-chart`

**Trades:**
- `GET /api/trades`
- `GET /api/trades/open`
- `GET /api/trades/performance`
- `POST /api/trades/close/:id`
- `POST /api/trades/close-all`

**Signals:**
- `GET /api/signals`
- `GET /api/signals/pending-approval`
- `POST /api/signals/analyze/:pair`
- `POST /api/signals/approve/:id`
- `POST /api/signals/reject/:id`

**Admin:**
- `GET /api/admin/config`
- `POST /api/admin/mode`
- `POST /api/admin/enable-live`
- `POST /api/admin/kill-switch`
- `POST /api/admin/reset-kill-switch`
- `GET /api/admin/audit-logs`
- `GET /api/admin/users`

**Backtest:**
- `POST /api/backtest/run`
- `GET /api/backtest/results`

**Health:**
- `GET /api/health`

---

## Key Design Elements

### Color Palette
- **Background**: `#0a0e1a` to `#020617` (deep navy gradient)
- **Surface**: `rgba(255,255,255,0.03)` with border `rgba(255,255,255,0.08)`
- **Primary**: `#3b82f6` (blue-500)
- **Success**: `#10b981` (emerald-500)
- **Danger**: `#ef4444` (red-500)
- **Warning**: `#f59e0b` (amber-500)

### Typography
- **Font**: Inter (Google Fonts)
- **Brand Font**: Poppins (for headings)

### Effects
- **Glassmorphism**: `backdrop-blur-xl` with semi-transparent backgrounds
- **Glow**: Blue glow animation on brand elements
- **Shimmer**: Loading shimmer effect
- **Float**: Subtle floating animation for background elements

---

## Customization

### Changing Brand Colors
Edit `app/globals.css`:
```css
:root {
  --brand-primary: 220 90% 50%;    /* Change hue/value */
  --brand-secondary: 200 80% 40%;
  --brand-accent: 50 90% 60%;
}
```

### Adding New Pages
1. Create folder in `app/dashboard/`
2. Add to sidebar navigation in `app/dashboard/layout.tsx`
3. Follow existing component patterns

---

## Security Features

- JWT token auto-refresh before expiry
- Secure cookie handling
- Role-based access control (RBAC)
- Kill switch for emergency stops
- Audit logging for all actions

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## License

Private - For NiveshAI Guard Trading Bot

---

## Support

For issues or questions, contact the development team.
