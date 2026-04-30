/**
 * Curated re-exports from lucide-react.
 *
 * Use these icons by default in layout chrome and shared components so the
 * bundle only pulls a consistent subset. Add new ones here when a feature
 * truly needs them — don't bypass by importing from "lucide-react" in random
 * UI files (allowed for feature-local icons, but centralize anything that
 * appears in layout, auth, or navigation).
 */

export {
  // Navigation / layout
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  // Auth / account
  User,
  UserCircle,
  LogIn,
  LogOut,
  // Content / common
  Home,
  Search,
  MapPin,
  Bell,
  Plus,
  Check,
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  Loader2,
  MoreHorizontal,
  Settings,
  // Property domain (used in navbar category strip)
  Building2,
} from "lucide-react"

export type { LucideIcon } from "lucide-react"
