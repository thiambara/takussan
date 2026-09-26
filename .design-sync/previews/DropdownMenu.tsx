import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
} from 'takussan';

export function AccountMenu() {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Icons.UserCircle />Mon compte
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Awa Diop</DropdownMenuLabel>
        <DropdownMenuItem><Icons.User />Profil</DropdownMenuItem>
        <DropdownMenuItem><Icons.Bell />Notifications</DropdownMenuItem>
        <DropdownMenuItem><Icons.Settings />Paramètres</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem><Icons.LogOut />Se déconnecter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
