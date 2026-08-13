# Takussan — Routing, Layouts & Profils par Rôle

> ## ⛔ PLAN RÉVOQUÉ — la stack qu'il prescrit n'existe plus
>
> **Vérifié le 2026-08-12.** Ce document impose, au ton impératif (« Règles absolues »), trois
> choix qui sont tous faux aujourd'hui :
>
> | Il prescrit | Le projet est en |
> |---|---|
> | Next.js 14 | **Next.js 16.2.3** (App Router, `proxy.ts`) |
> | TailwindCSS v3 | **Tailwind v4** (`@theme inline`) |
> | Palette « Takussan Heritage » (`#022448`, `#7d5630`, `#fff8f5`) | Palette **« Lin »** (`#fcf9f3`, `#a85332`, `#5d6e4f`) depuis TCK-129 |
>
> Ses interdits — « JAMAIS de `border-b` », « uniquement `shadow-[0_0_40px_…]` » — appartiennent à
> une direction artistique abandonnée. **C'est son ton impératif qui le rend dangereux** : il ne se
> présente pas comme une piste.
>
> Le design system en vigueur : [`../design-guidelines.md`](../design-guidelines.md) et
> [`../../takussan-web/CLAUDE.md`](../../takussan-web/CLAUDE.md).

Refonte complète de la structure des espaces privés : suppression de `/dashboard`, création de layouts différenciés par acteur (`/app/…` + `/admin/…`), page profil composite conditionnelle par rôle, et stubs de toutes les sections métier.

---

## 0. Contexte & contraintes

### Stack

- **Framework** : Next.js 14+ App Router (RSC + `'use client'` explicite)
- **Styles** : TailwindCSS v3 — utiliser les classes utilitaires, jamais de style inline sauf exception justifiée
- **Composants UI** : shadcn/ui (`@/components/ui/…`) déjà installé
- **Auth** : token dans cookie `auth_token` (constante `AUTH_COOKIE_NAME` dans `@/lib/constants`)
- **User courant côté serveur** : `getMeAction()` depuis `@/app/actions/auth` — retourne `User` ou throw si non authentifié
- **User courant côté client** : `useAuth()` depuis `@/context/AuthContext` — retourne `{ user, isLoading }`

### Types existants à réutiliser (ne pas redéclarer)

```ts
// @/types/user.ts — déjà en place, NE PAS modifier
type UserRole = 'customer' | 'agent' | 'agency_admin' | 'owner' | 'service_provider' | 'super_admin';
type UserStatus = 'active' | 'inactive' | 'banned';
type User = {
  id: number;
  first_name: string; last_name: string; full_name: string;
  email: string; phone: string | null; bio: string | null;
  avatar_url: string | null; email_verified_at: string | null;
  roles: UserRole[]; status: UserStatus; created_at: string;
};
```

### Design System Takussan Heritage (tokens CSS / Tailwind)

| Token | Valeur | Usage |
| --- | --- | --- |
| `primary` | `#022448` | Topbar, CTAs, texte actif |
| `secondary` | `#7d5630` | Accents terracotta |
| `background` | `#fff8f5` | Fond global |
| `surface-low` | `#fcf2eb` | Fond sidebar |
| `surface-high` | `#f0e6e0` | Hover items |
| `surface-highest` | `#eae1da` | Item actif sidebar |
| `on-surface` | `#1f1b17` | Texte principal |
| `on-surface-variant` | `#43474e` | Texte secondaire |

**Règles absolues** :

- JAMAIS de `border-b`, `border-t`, `border-l` pour séparer des sections — utiliser des shifts de fond
- Pas de `shadow-md` ou `shadow-lg` — uniquement `shadow-[0_0_40px_0_rgba(31,27,23,0.04)]`
- Pas d'emojis dans le code ou les labels
- `rounded-md` sur boutons, `rounded-xl` sur images, `rounded-2xl` sur cards
- Espacement minimum entre sections : `gap-8` ou `py-8`

---

## 1. Fichiers à supprimer

```
src/app/(protected)/dashboard/profile/page.tsx   → supprimer
src/app/(protected)/dashboard/                   → supprimer dossier entier
src/app/(protected)/layout.tsx                   → supprimer
```

> Après suppression, `(protected)` doit être vide — le supprimer aussi.

---

## 2. `src/lib/roles.ts` — nouveau fichier

```ts
import type { UserRole } from '@/types/user';

export function isAgent(roles: UserRole[]): boolean {
  return roles.includes('agent');
}

export function isOwner(roles: UserRole[]): boolean {
  return roles.includes('owner');
}

export function isCustomer(roles: UserRole[]): boolean {
  return roles.includes('customer');
}

export function isAdmin(roles: UserRole[]): boolean {
  return roles.includes('agency_admin') || roles.includes('super_admin');
}

export function isSuperAdmin(roles: UserRole[]): boolean {
  return roles.includes('super_admin');
}

export function isServiceProvider(roles: UserRole[]): boolean {
  return roles.includes('service_provider');
}

export function getPrimaryRole(roles: UserRole[]): UserRole | null {
  const priority: UserRole[] = ['super_admin', 'agency_admin', 'agent', 'owner', 'service_provider', 'customer'];
  return priority.find((r) => roles.includes(r)) ?? null;
}
```

---

## 3. Composants layout — `src/components/layout/`

### 3a. `AppSidebar.tsx`

**Type** : `'use client'`

**Props** :

```ts
interface AppSidebarProps {
  user: User;
  className?: string;
}
```

**Comportement** :

- Utilise `usePathname()` pour détecter l'item actif
- Item actif : fond `bg-[#eae1da]`, texte `text-[#022448]`, `font-semibold`
- Item inactif : texte `text-[#43474e]`, hover `bg-[#f0e6e0]`
- Fond sidebar : `bg-[#fcf2eb]`
- Largeur fixe desktop : `w-64`, collapsible sur mobile (drawer via `Sheet` shadcn)
- Section "Profil" en bas avec avatar + nom + lien `/app/profile`

**Navigation par rôle** (utilise `isAgent`, `isOwner`, etc. depuis `@/lib/roles`) :

```
customer   → Tableau de bord (/app), Mes réservations (/app/bookings),
             Mes baux (/app/leases), Paiements (/app/payments),
             Messagerie (/app/messages), Documents (/app/documents)

owner      → Tableau de bord (/app), Mes biens (/app/properties),
             Réservations (/app/bookings), Baux (/app/leases),
             Finances (/app/payments), Messagerie (/app/messages), Documents (/app/documents)

agent      → Tableau de bord (/app), Mes biens (/app/properties),
             Publier un bien (/app/properties/new) [CTA mis en avant],
             CRM (/app/crm), Réservations (/app/bookings),
             Baux (/app/leases), Maintenance (/app/maintenance),
             Documents (/app/documents), Messagerie (/app/messages)

service_provider → Tableau de bord (/app), Interventions (/app/maintenance),
                   Documents (/app/documents), Messagerie (/app/messages)

admin/super_admin → Lien "Administration" → /admin [badge distinct]
                   + tous les liens agent ci-dessus
```

**Structure JSX** :

```tsx
<aside className="h-full w-64 bg-[#fcf2eb] flex flex-col">
  {/* Logo zone */}
  <div className="px-6 py-5">
    <Link href="/" className="text-xl font-bold tracking-tighter text-[#022448]">Takussan</Link>
  </div>
  {/* Nav items */}
  <nav className="flex-1 px-3 space-y-1">
    {navItems.map(item => <SidebarItem key={item.href} {...item} active={pathname === item.href} />)}
  </nav>
  {/* User footer */}
  <div className="px-3 pb-4">
    <SidebarUserFooter user={user} />
  </div>
</aside>
```

**Icônes Lucide à utiliser** :

- Tableau de bord → `LayoutDashboard`
- Mes biens → `Building2`
- Réservations → `CalendarCheck`
- Baux → `FileText`
- Paiements / Finances → `CreditCard`
- Messagerie → `MessageSquare`
- Documents → `FolderOpen`
- Maintenance / Interventions → `Wrench`
- CRM → `Users`
- Administration → `ShieldCheck`
- Publier un bien → `PlusCircle`

### 3b. `AdminSidebar.tsx`

**Type** : `'use client'`

**Props** : `{ user: User; className?: string }`

**Différences vs AppSidebar** :

- Fond `bg-[#022448]` (primary), texte blanc
- Item actif : `bg-white/10`, texte blanc bold
- Item inactif : `text-white/70`, hover `bg-white/5`
- Navigation fixe :

```
Tableau de bord (/admin)
Biens (/admin/properties) [si super_admin seulement]
Équipe (/admin/users)
Finances (/admin/finances)
Modération (/admin/moderation) [si super_admin seulement]
Rôles & Permissions (/admin/roles)
Journal d'audit (/admin/audit)
Paramètres (/admin/settings)
```

- Lien "Retour à l'espace perso" → `/app` en bas (avant user footer)

### 3c. `AppTopbar.tsx`

**Type** : `'use client'`

**Props** : `{ user: User; onMenuToggle?: () => void }`

**Comportement** :

- Fond `bg-[#022448]`, hauteur `h-14`
- Gauche : hamburger (mobile, `Menu` icon) + logo "Takussan" texte blanc
- Centre (desktop uniquement) : search pill — fond `bg-white/10 hover:bg-white/20`, placeholder "Rechercher des biens...", click → `router.push('/properties')`
- Droite : avatar dropdown (shadcn `DropdownMenu`)
  - Avatar avec initiales ou `avatar_url`, affiche `user.first_name`
  - Menu items : "Mon profil" → `/app/profile`, si `isAdmin` → "Administration" → `/admin`, séparateur, "Déconnexion" → `logoutAction` (Server Action)

### 3d. `AppShell.tsx`

**Type** : `'use client'`

**Props** :

```ts
interface AppShellProps {
  user: User;
  children: React.ReactNode;
}
```

**Comportement** :

- Gère l'état `sidebarOpen` pour mobile (boolean, default `false`)
- Desktop : layout `flex h-screen` — sidebar fixe gauche + main scrollable droite
- Mobile : sidebar dans `Sheet` (shadcn) ouvert via hamburger dans topbar
- `main` : `flex-1 overflow-y-auto bg-[#fff8f5]`
- Padding contenu : `px-6 py-8` (desktop), `px-4 py-6` (mobile)

### 3e. `AdminShell.tsx`

Même structure qu'`AppShell` mais utilise `AdminSidebar` à la place d'`AppSidebar`. Topbar identique (`AppTopbar` partagé).

---

## 4. Layouts Next.js

### 4a. `src/app/app/layout.tsx`

**Type** : Server Component (pas de `'use client'`)

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { getMeAction } from '@/app/actions/auth';
import { AppShell } from '@/components/layout/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get(AUTH_COOKIE_NAME)?.value) redirect('/auth/login');
  const user = await getMeAction();
  return <AppShell user={user}>{children}</AppShell>;
}
```

### 4b. `src/app/admin/layout.tsx`

**Type** : Server Component

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AdminShell } from '@/components/layout/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get(AUTH_COOKIE_NAME)?.value) redirect('/auth/login');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');
  return <AdminShell user={user}>{children}</AdminShell>;
}
```

---

## 5. Page profil composite

### 5a. `src/app/app/profile/page.tsx`

**Type** : Server Component

```tsx
import { getMeAction } from '@/app/actions/auth';
import { isAgent, isOwner, isCustomer, isAdmin } from '@/lib/roles';
import { ProfileLayout } from '@/components/profile/ProfileLayout';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileContactSection } from '@/components/profile/ProfileContactSection';
import { ProfileCustomerSection } from '@/components/profile/ProfileCustomerSection';
import { ProfileAgentSection } from '@/components/profile/ProfileAgentSection';
import { ProfileOwnerSection } from '@/components/profile/ProfileOwnerSection';
import { ProfileAdminSection } from '@/components/profile/ProfileAdminSection';
import { ProfileSecuritySection } from '@/components/profile/ProfileSecuritySection';

export default async function ProfilePage() {
  const user = await getMeAction();
  return (
    <ProfileLayout>
      <ProfileHeader user={user} />
      <ProfileContactSection user={user} />
      {isCustomer(user.roles) && <ProfileCustomerSection user={user} />}
      {isAgent(user.roles) && <ProfileAgentSection user={user} />}
      {isOwner(user.roles) && <ProfileOwnerSection user={user} />}
      {isAdmin(user.roles) && <ProfileAdminSection user={user} />}
      <ProfileSecuritySection />
    </ProfileLayout>
  );
}
```

### 5b. `src/components/profile/ProfileLayout.tsx`

```ts
interface ProfileLayoutProps { children: React.ReactNode }
```

Container : `max-w-2xl mx-auto space-y-8`. Pas de wrapper avec fond — les sections gèrent leur propre fond tonal.

### 5c. `src/components/profile/ProfileHeader.tsx`

**Type** : `'use client'` (contient état édition avatar)

**Props** : `{ user: User }`

**Contenu** :

- Avatar `size-24` avec `avatar_url` ou initiales. Fond `bg-[#022448]`, texte blanc.
- `full_name` en `text-2xl font-bold text-[#1f1b17]`
- `email` en `text-sm text-[#43474e]`
- Badge rôle principal (`getPrimaryRole()`) — fond `bg-[#fcf2eb]`, texte `text-[#022448] text-xs font-semibold px-3 py-1 rounded-full`
- Map rôle → label FR : `customer` → "Locataire / Acheteur", `agent` → "Agent immobilier", `owner` → "Propriétaire bailleur", `agency_admin` → "Admin agence", `super_admin` → "Super administrateur", `service_provider` → "Prestataire"
- Bouton "Modifier le profil" → ouvre un `Dialog` shadcn avec formulaire (prénom, nom, bio) qui soumet via `updateProfileAction`

### 5d. `src/components/profile/ProfileContactSection.tsx`

**Props** : `{ user: User }`

**Type** : `'use client'`

**Fond section** : `bg-[#fcf2eb] rounded-2xl p-6`

**Champs** : téléphone (avec statut vérifié/non vérifié via `email_verified_at`), bio texte libre (max 500 chars)

**Action** : formulaire inline, soumis via `updateProfileAction`

### 5e. `src/components/profile/ProfileCustomerSection.tsx`

**Props** : `{ user: User }`

**Titre** : "Préférences de recherche"

**Fond** : `bg-[#fcf2eb] rounded-2xl p-6`

**Contenu stub** : type de bien préféré (Select), budget max (Input), villes favorites (Input), alertes email (Switch) — tous `disabled` avec label "Bientôt disponible"

### 5f. `src/components/profile/ProfileAgentSection.tsx`

**Props** : `{ user: User }`

**Titre** : "Profil professionnel"

**Fond** : `bg-[#fcf2eb] rounded-2xl p-6`

**Champs** : bio professionnelle (textarea), spécialisations (multi-select stub disabled "Bientôt disponible"), n° de licence (Input), agence liée (lecture seule)

### 5g. `src/components/profile/ProfileOwnerSection.tsx`

**Props** : `{ user: User }`

**Titre** : "Espace bailleur"

**Fond** : `bg-[#fcf2eb] rounded-2xl p-6`

**Contenu** : type de bailleur disabled (particulier/société), 2 stat cards stub (biens, locataires actifs) avec valeur "—", lien "Accéder à mes biens" → `/app/properties`

### 5h. `src/components/profile/ProfileAdminSection.tsx`

**Props** : `{ user: User }`

**Titre** : "Administration"

**Fond** : `bg-[#eae1da] rounded-2xl p-6`

**Contenu** : rôle admin (label FR), lien "Gérer l'agence" → `/admin/agency`, lien "Journal d'audit" → `/admin/audit`, bouton "Espace administration" → `/admin`

### 5i. `src/components/profile/ProfileSecuritySection.tsx`

**Type** : `'use client'`

**Titre** : "Sécurité"

**Fond** : `bg-[#fcf2eb] rounded-2xl p-6`

**Contenu** : statut vérification email, formulaire changer mot de passe disabled "Bientôt disponible", sessions actives stub

---

## 6. Pages stub `/app/`

**Pattern commun** :

```tsx
import { getMeAction } from '@/app/actions/auth';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function SectionPage() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1f1b17]">Titre</h1>
        <p className="text-sm text-[#43474e] mt-1">Description</p>
      </div>
      <StubPlaceholder label="Nom feature" />
    </div>
  );
}
```

**Créer `src/components/shared/StubPlaceholder.tsx`** :

```ts
interface StubPlaceholderProps {
  label: string;
  description?: string;
}
```

Visuel : zone `bg-[#fcf2eb] rounded-2xl p-12` centrée, icône Lucide `Construction`, texte "En cours de développement", sous-titre optionnel.

**Pages à créer** :

| Fichier | Titre H1 | Description |
| --- | --- | --- |
| `src/app/app/page.tsx` | Tableau de bord | Vue d'ensemble de votre activité |
| `src/app/app/bookings/page.tsx` | Réservations | Gérez vos demandes de réservation |
| `src/app/app/leases/page.tsx` | Baux | Consultez et gérez vos contrats |
| `src/app/app/payments/page.tsx` | Paiements | Historique et suivi des paiements |
| `src/app/app/messages/page.tsx` | Messagerie | Vos conversations |
| `src/app/app/documents/page.tsx` | Documents | Bibliothèque de documents |
| `src/app/app/maintenance/page.tsx` | Maintenance | Demandes et suivi d'interventions |
| `src/app/app/properties/page.tsx` | Mes biens | Gérez votre portefeuille immobilier |
| `src/app/app/properties/new/page.tsx` | Publier un bien | Ajoutez un nouveau bien |
| `src/app/app/crm/page.tsx` | CRM | Gestion de votre portefeuille clients |

> `src/app/app/page.tsx` (dashboard) : afficher 4 stat cards stub en `grid grid-cols-2 md:grid-cols-4 gap-4` (fond `bg-[#fcf2eb] rounded-2xl p-6`, valeur "—") + `StubPlaceholder`. Noms des stats selon rôle : agent → "Biens actifs", "Clients", "Réservations", "Commissions" ; customer → "Favoris", "Réservations", "Baux actifs", "Messages".

---

## 7. Pages stub `/admin/`

| Fichier | Titre | Guard supplémentaire |
| --- | --- | --- |
| `src/app/admin/page.tsx` | Tableau de bord agence | — |
| `src/app/admin/users/page.tsx` | Gestion des utilisateurs | — |
| `src/app/admin/agency/page.tsx` | Configuration de l'agence | — |
| `src/app/admin/finances/page.tsx` | Finances | — |
| `src/app/admin/moderation/page.tsx` | Modération | redirect `/admin` si `!isSuperAdmin` |
| `src/app/admin/roles/page.tsx` | Rôles & Permissions | — |
| `src/app/admin/audit/page.tsx` | Journal d'audit | — |
| `src/app/admin/settings/page.tsx` | Paramètres | — |

---

## 8. Mise à jour `Navbar` (public)

**Fichier** : `src/components/home/Navbar.tsx`

Remplacements exacts (replace all occurrences) :

```
/dashboard/profile              → /app/profile
/dashboard/annonces/new         → /app/properties/new
/auth/login?redirect=/dashboard → /auth/login?redirect=/app
```

Ne rien changer d'autre dans ce fichier.

---

## 9. Arborescence complète des fichiers à créer

```
src/
├── lib/
│   └── roles.ts
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── AppTopbar.tsx
│   │   ├── AppSidebar.tsx
│   │   ├── AdminShell.tsx
│   │   └── AdminSidebar.tsx
│   ├── profile/
│   │   ├── ProfileLayout.tsx
│   │   ├── ProfileHeader.tsx
│   │   ├── ProfileContactSection.tsx
│   │   ├── ProfileCustomerSection.tsx
│   │   ├── ProfileAgentSection.tsx
│   │   ├── ProfileOwnerSection.tsx
│   │   ├── ProfileAdminSection.tsx
│   │   └── ProfileSecuritySection.tsx
│   └── shared/
│       └── StubPlaceholder.tsx
└── app/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── profile/page.tsx
    │   ├── bookings/page.tsx
    │   ├── leases/page.tsx
    │   ├── payments/page.tsx
    │   ├── messages/page.tsx
    │   ├── documents/page.tsx
    │   ├── maintenance/page.tsx
    │   ├── crm/page.tsx
    │   └── properties/
    │       ├── page.tsx
    │       └── new/page.tsx
    └── admin/
        ├── layout.tsx
        ├── page.tsx
        ├── users/page.tsx
        ├── agency/page.tsx
        ├── finances/page.tsx
        ├── moderation/page.tsx
        ├── roles/page.tsx
        ├── audit/page.tsx
        └── settings/page.tsx
```

**Fichiers à modifier** :

- `src/components/home/Navbar.tsx` — 3 remplacements d'URLs (section 8)

**Fichiers à supprimer** :

- `src/app/(protected)/dashboard/profile/page.tsx`
- `src/app/(protected)/layout.tsx`
- `src/app/(protected)/` (dossier entier)

---

## 10. Critères de validation (Definition of Done)

- [ ] `npm run build` passe sans erreurs TypeScript
- [ ] Naviguer vers `/dashboard` retourne 404
- [ ] Utilisateur non authentifié sur `/app/profile` → redirect `/auth/login`
- [ ] Utilisateur `customer` sur `/admin` → redirect `/app/profile`
- [ ] Utilisateur `agent` voit le lien "CRM" dans la sidebar, `customer` ne le voit pas
- [ ] Page profil `agent` affiche `ProfileAgentSection`, pas `ProfileCustomerSection`
- [ ] Aucune bordure 1px solide dans les nouveaux composants
- [ ] Topbar visible sur toutes les pages `/app/…` et `/admin/…`
- [ ] Sidebar collapsible en mobile (Sheet)
- [ ] Les liens `/dashboard/…` dans `Navbar.tsx` ont tous été remplacés

---

## Ce qui ne change pas (NE PAS MODIFIER)

- `src/app/(public)/` — home, properties, search
- `src/app/auth/` — login, register, OAuth
- `src/context/AuthContext.tsx`
- `src/lib/api.ts`
- `src/types/user.ts`
- `src/components/profile/ProfileForm.tsx` (garder, sera inactif)
- `src/app/actions/auth.ts`
- `src/lib/constants.ts`
