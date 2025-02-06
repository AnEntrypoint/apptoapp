import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

type ArtworkItem = {
  id: number;
  title: string;
  category: string;
  imageUrl: string;
  description: string;
};

export default function Portfolio() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [artworks] = useState<ArtworkItem[]>([
    {
      id: 1,
      title: 'Artwork 1',
      category: 'digital',
      imageUrl: '/placeholder1.jpg',
      description: 'A beautiful digital artwork'
    },
    // Add more sample artworks here
  ]);

  const categories = ['all', 'digital', 'traditional', 'photography'];

  const filteredArtworks = selectedCategory === 'all'
    ? artworks
    : artworks.filter(art => art.category === selectedCategory);

  return (
    <section className="py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-center space-x-4 mb-8">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full ${
                selectedCategory === category
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArtworks.map(artwork => (
            <motion.div
              key={artwork.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-lg shadow-lg overflow-hidden"
            >
              <div className="relative h-64">
                <Image
                  src={artwork.imageUrl}
                  alt={artwork.title}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-4">
                <h3 className="text-xl font-semibold mb-2">{artwork.title}</h3>
                <p className="text-gray-600">{artwork.description}</p>
                <span className="inline-block mt-2 px-3 py-1 text-sm text-purple-600 bg-purple-100 rounded-full">
                  {artwork.category}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
} 