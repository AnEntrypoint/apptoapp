import { motion } from 'framer-motion';

export default function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500"
    >
      <div className="text-center text-white">
        <motion.h1
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          className="text-6xl font-bold mb-4"
        >
          Artist Name
        </motion.h1>
        <motion.p
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          className="text-xl"
        >
          Transforming imagination into reality
        </motion.p>
      </div>
    </motion.section>
  );
} 