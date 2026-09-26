import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount } from 'takussan';

export function Sizes() {
  return (
    <div className="flex items-center gap-6">
      <Avatar size="sm"><AvatarFallback>AD</AvatarFallback></Avatar>
      <Avatar><AvatarFallback>MS</AvatarFallback></Avatar>
      <Avatar size="lg"><AvatarFallback>KN</AvatarFallback></Avatar>
    </div>
  );
}

export function BadgeAndGroup() {
  return (
    <div className="flex items-center gap-8">
      <Avatar size="lg"><AvatarFallback>FN</AvatarFallback><AvatarBadge /></Avatar>
      <AvatarGroup>
        <Avatar><AvatarFallback>AD</AvatarFallback></Avatar>
        <Avatar><AvatarFallback>FB</AvatarFallback></Avatar>
        <Avatar><AvatarFallback>IS</AvatarFallback></Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>
    </div>
  );
}
