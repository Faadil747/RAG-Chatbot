import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-4 py-8 text-center">
      <Card className="flex flex-col items-center gap-3 border-dashed p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <Compass className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold">Page not found</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            The page you're looking for doesn't exist or may have moved.
          </p>
        </div>
        <Button asChild size="sm" className="mt-1">
          <Link to="/">Back to Home</Link>
        </Button>
      </Card>
    </div>
  );
}
