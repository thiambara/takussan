'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionMatrix } from './PermissionMatrix';
import { useCreateRoleMutation } from '@/hooks/useAdminRoles';
import type {
  PermissionCatalogueGroup,
  RoleListItem,
} from '@/types/admin-roles';

interface CreateRoleDialogProps {
  readonly catalogue: readonly PermissionCatalogueGroup[];
  readonly onCreated?: (role: RoleListItem) => void;
}

const NAME_PATTERN = /^[a-z0-9_]+$/;

export function CreateRoleDialog({ catalogue, onCreated }: CreateRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const createMutation = useCreateRoleMutation();

  // Clear local state on close (and on re-open) so a re-opened dialog
  // never leaks a half-typed name from the previous session.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName('');
      setSelected(new Set());
      createMutation.reset();
    }
    setOpen(next);
  };

  const trimmed = name.trim();
  const nameValid = trimmed.length > 0 && NAME_PATTERN.test(trimmed);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid) return;
    createMutation.mutate(
      { name: trimmed, permissions: Array.from(selected) },
      {
        onSuccess: (role) => {
          onCreated?.(role);
          handleOpenChange(false);
        },
      },
    );
  };

  const handleToggle = (perm: string, next: boolean) => {
    setSelected((prev) => {
      const out = new Set(prev);
      if (next) out.add(perm);
      else out.delete(perm);
      return out;
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" data-testid="create-role-trigger">
            <Plus aria-hidden="true" className="mr-1 h-4 w-4" /> Nouveau rôle
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Créer un rôle personnalisé</DialogTitle>
          <DialogDescription>
            Le rôle sera créé dans votre agence courante. Le nom doit être en
            minuscules, sans espaces (ex. <code>comptable</code>).
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="create-role-name">Nom interne</Label>
            <Input
              id="create-role-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
              pattern="[a-z0-9_]+"
              data-testid="create-role-name"
            />
            {trimmed.length > 0 && !nameValid ? (
              <p className="text-xs text-destructive">
                Minuscules, chiffres et underscores uniquement.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Permissions de base</Label>
            <PermissionMatrix
              catalogue={catalogue}
              selected={selected}
              onToggle={handleToggle}
            />
          </div>

          {createMutation.error ? (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="create-role-error"
            >
              {createMutation.error.displayMessage}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!nameValid || createMutation.isPending}
              data-testid="create-role-submit"
            >
              {createMutation.isPending ? (
                <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Créer le rôle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
