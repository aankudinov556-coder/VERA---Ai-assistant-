import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Модальное окно с плавным появлением/исчезновением (используется внутри AnimatePresence). */
export function Modal({ className = "", onClose, children }: { className?: string; onClose: () => void; children: ReactNode }) {
  return (
    <motion.div
      className="overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className={`glass panel ${className}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        role="dialog"
        aria-modal
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
