import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ChatWindow } from '@/components/chat/ChatWindow';

export function FloatingAssistantButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft-lg"
          aria-label="Open AI assistant"
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                <X className="h-6 w-6" />
              </motion.span>
            ) : (
              <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
                <MessageCircle className="h-6 w-6" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <ChatWindow compact className="h-full" />
        </SheetContent>
      </Sheet>
    </>
  );
}
