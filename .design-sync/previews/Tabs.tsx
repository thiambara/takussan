import { Tabs, TabsContent, TabsList, TabsTrigger } from 'takussan';

export function Default() {
  return (
    <Tabs defaultValue="apercu">
      <TabsList>
        <TabsTrigger value="apercu">Aperçu</TabsTrigger>
        <TabsTrigger value="baux">Baux</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
      </TabsList>
      <TabsContent value="apercu" className="pt-2 text-sm text-muted-foreground">
        Trois biens actifs, un bail à renouveler avant le 31 octobre.
      </TabsContent>
    </Tabs>
  );
}

export function Line() {
  return (
    <Tabs defaultValue="louer">
      <TabsList variant="line">
        <TabsTrigger value="tous">Tous</TabsTrigger>
        <TabsTrigger value="louer">À louer</TabsTrigger>
        <TabsTrigger value="vendre">À vendre</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
