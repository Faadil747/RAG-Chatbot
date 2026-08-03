import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { motion, type Target } from 'framer-motion';
import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]', className)}
    asChild
    {...props}
  >
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    />
  </DialogPrimitive.Overlay>
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-4 border-border bg-card p-6 shadow-soft-lg focus:outline-none',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b',
        bottom: 'inset-x-0 bottom-0 border-t',
        left: 'inset-y-0 left-0 h-full w-full max-w-sm border-r sm:max-w-md',
        right: 'inset-y-0 right-0 h-full w-full max-w-sm border-l sm:max-w-md',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  }
);

interface SheetMotionOffsets {
  initial: Target;
  animate: Target;
  exit: Target;
}

const sheetMotionVariants: Record<NonNullable<VariantProps<typeof sheetVariants>['side']>, SheetMotionOffsets> = {
  top: { initial: { x: 0, y: '-100%' }, animate: { x: 0, y: 0 }, exit: { x: 0, y: '-100%' } },
  bottom: { initial: { x: 0, y: '100%' }, animate: { x: 0, y: 0 }, exit: { x: 0, y: '100%' } },
  left: { initial: { x: '-100%', y: 0 }, animate: { x: 0, y: 0 }, exit: { x: '-100%', y: 0 } },
  right: { initial: { x: '100%', y: 0 }, animate: { x: 0, y: 0 }, exit: { x: '100%', y: 0 } },
};

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, ...props }, ref) => {
  const motionProps = sheetMotionVariants[side ?? 'right'];
  // No forceMount here: Radix only mounts the Portal/Overlay/Content while
  // the Sheet is actually open. (forceMount would keep this permanently in
  // the DOM -- including its full-screen overlay -- even while closed.) The
  // tradeoff is the exit animation doesn't get to play since Radix unmounts
  // immediately on close; the entrance slide-in still runs on every mount.
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        asChild
        {...props}
      >
        <motion.div
          initial={motionProps.initial}
          animate={motionProps.animate}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </motion.div>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
