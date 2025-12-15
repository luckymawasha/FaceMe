import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Sparkles, TrendingUp, Clock, Filter, Share2, Calendar, Store, Bot } from 'lucide-react';
import PostCard from './PostCard';
import CreatePostModal from './CreatePostModal';
import { usePostStore } from '@/store/postStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUserStore } from '@/store/userStore';
import { api } from '@/lib/api';

interface MediaItem {
  id: string;
  title: string;
  publisher: string;
  description: string;
  coverImage?: string;
  tags: string[];
  priceDigital: number;
  pricePrint: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

type FeedFilter = 'ai-curated' | 'recent' | 'trending';

const MOCK_MEDIA: MediaItem[] = [
  {
    id: 'm1',
    title: 'Cape Town Daily',
    publisher: 'Cape Media Group',
    description: 'Local and global headlines, sport, and business every morning.',
    coverImage: 'https://images.unsplash.com/photo-1514996937319-344454492b37?w=600&q=80',
    tags: ['newspaper', 'news', 'daily'],
    priceDigital: 39,
    pricePrint: 59,
    frequency: 'daily',
  },
  {
    id: 'm2',
    title: 'Creator Stories Magazine',
    publisher: 'FaceMeX Media',
    description: 'Deep dives with African creators, founders, and storytellers.',
    coverImage: 'https://images.unsplash.com/photo-1512428232641-78a589fd95fd?w=600&q=80',
    tags: ['magazine', 'creators', 'business'],
    priceDigital: 49,
    pricePrint: 89,
    frequency: 'monthly',
  },
  {
    id: 'm3',
    title: 'Tech Futures Weekly',
    publisher: 'Nova Tech Press',
    description: 'AI, startups, and web3 in plain language.',
    coverImage: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&q=80',
    tags: ['magazine', 'tech', 'weekly'],
    priceDigital: 29,
    pricePrint: 69,
    frequency: 'weekly',
  },
];

function MediaStrip() {
  const [items, setItems] = useState<MediaItem[]>(() => [...MOCK_MEDIA]);

  // Load persisted items on mount (same logic as MediaShopPage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('faceme_media_items_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as MediaItem[];
        setItems(parsed);
      }
    } catch {}
  }, []);

  // Persist items whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('faceme_media_items_v1', JSON.stringify(items));
    } catch {}
  }, [items]);

  const displayItems = useMemo(() => {
    // If we have persisted items, use them; otherwise fall back to mock
    const persistedRaw = localStorage.getItem('faceme_media_items_v1');
    if (persistedRaw) {
      try {
        const parsed = JSON.parse(persistedRaw) as MediaItem[];
        return parsed.length ? parsed : MOCK_MEDIA;
      } catch {
        return MOCK_MEDIA;
      }
    }
    return MOCK_MEDIA;
  }, [items]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">Newspapers & magazines</span>
        <span className="text-[11px] text-muted-foreground">
          Slow slide preview from the Media Shop
        </span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/90 dark:bg-slate-900/90 px-3 py-2">
        <div className="relative h-24 sm:h-28">
          <motion.div
            className="absolute inset-y-0 left-0 flex items-center gap-3 pr-8"
            initial={{ x: '0%' }}
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          >
            {[...displayItems, ...displayItems].map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/90 px-3 py-2 min-w-[180px] shadow-sm"
              >
                <div className="h-12 w-9 rounded-md bg-gradient-to-br from-slate-700 via-slate-900 to-slate-800 flex items-center justify-center text-[10px] font-semibold text-slate-100">
                  {item.frequency === 'daily' ? 'Newspaper' : 'Magazine'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{item.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {item.publisher} · Digital & hard copy
                  </div>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Right-side blue light sweep */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background to-transparent" />
          <motion.div
            className="pointer-events-none absolute top-2 bottom-2 right-4 w-1.5 rounded-full bg-gradient-to-b from-blue-400 via-blue-500 to-blue-400 shadow-[0_0_16px_rgba(59,130,246,0.9)]"
            initial={{ opacity: 0.4, y: 0 }}
            animate={{ opacity: [0.2, 0.8, 0.2], y: [0, 4, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </div>
  );
}

export default function NewsFeed() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>('ai-curated');
  const { posts, trendingHashtags, loadPosts } = usePostStore();
  const [displayPosts, setDisplayPosts] = useState(posts);
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(5);
  const [observerNode, setObserverNode] = useState<HTMLDivElement | null>(null);
  const { mode, setMode } = useUserStore();
  const [skillQuery, setSkillQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        setNewPostsAvailable(true);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Sync skill filter from URL (?skill=) and ensure professional mode on deep-link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const skill = params.get('skill') || '';
    if (skill) {
      setSkillQuery(skill);
      if (mode !== 'professional') {
        // fire and forget; local state already updates immediately
        setMode('professional');
      }
    } else {
      // if URL no longer has a skill param, reset local query
      setSkillQuery('');
    }
  }, [location.search, mode, setMode]);

  // Initial load from API and reload on mode / skill change
  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadPosts(skillQuery || undefined).catch(() => {}),
      new Promise((r) => setTimeout(r, 400)),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, skillQuery]);

  // Filter posts based on selected filter and current mode
  useEffect(() => {
    let filtered = [...posts];
    // Safety: ensure we only show posts for the active mode
    if (mode) filtered = filtered.filter((p: any) => (p.mode === 'professional' ? 'professional' : 'social') === mode);
    
    switch (filter) {
      case 'ai-curated':
        filtered.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
        break;
      case 'recent':
        filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        break;
      case 'trending':
        filtered.sort((a, b) => (b.likes + b.shares * 2) - (a.likes + a.shares * 2));
        break;
    }
    
    setDisplayPosts(filtered);
    setVisibleCount(5);
  }, [posts, filter, mode]);

  useEffect(() => {
    if (!observerNode) return;
    const onIntersect: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisibleCount((c) => c + 5);
        }
      });
    };
    const io = new IntersectionObserver(onIntersect, { rootMargin: '200px' });
    io.observe(observerNode);
    return () => io.disconnect();
  }, [observerNode]);

  const loadNewPosts = () => {
    setNewPostsAvailable(false);
    // Refresh feed
    const refreshed = mode ? posts.filter((p: any) => (p.mode === 'professional' ? 'professional' : 'social') === mode) : posts;
    setDisplayPosts([...refreshed]);
  };

  const activeSkill = mode === 'professional' ? skillQuery.trim() : '';
  const [peopleForSkill, setPeopleForSkill] = useState<Array<{ id: string; name: string; avatar?: string; openToCollab?: boolean }>>([]);

  // Load professionals for the active skill from backend discovery endpoint
  useEffect(() => {
    if (!activeSkill) {
      setPeopleForSkill([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get(`/api/users/discover?skill=${encodeURIComponent(activeSkill)}`);
        if (!cancelled) {
          const users = Array.isArray(data.users) ? data.users : [];
          setPeopleForSkill(
            users.map((u: any) => ({
              id: String(u.id),
              name: u.name,
              avatar: u.avatar,
              openToCollab: !!u.professional?.openToCollab,
            }))
          );
        }
      } catch {
        if (!cancelled) setPeopleForSkill([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSkill]);

  return (
    <div className="max-w-3xl mx-auto py-8 px-3 sm:px-4 lg:px-6 pb-24 space-y-6">
      {/* New Posts Banner */}
      <AnimatePresence>
        {newPostsAvailable && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="mb-2"
          >
            <Button
              onClick={loadNewPosts}
              className="w-full h-9 rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800 text-xs font-medium shadow-sm"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              New posts available - Click to refresh
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Post Button */}
      <div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="w-full h-12 text-sm font-medium rounded-2xl bg-slate-900 text-slate-50 hover:bg-slate-800 shadow-sm"
        >
          <Plus className="h-6 w-6 mr-2" />
          Create Post
        </Button>
      </div>

      {/* Newspapers / Magazines slow-motion strip */}
      <MediaStrip />

      {/* Filter Options + Professional Skill Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                {filter === 'ai-curated' && 'AI Curated'}
                {filter === 'recent' && 'Recent'}
                {filter === 'trending' && 'Trending'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setFilter('ai-curated')}>
                <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                AI Curated
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter('recent')}>
                <Clock className="h-4 w-4 mr-2 text-blue-500" />
                Recent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter('trending')}>
                <TrendingUp className="h-4 w-4 mr-2 text-orange-500" />
                Trending
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {filter === 'ai-curated' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Badge variant="secondary" className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Personalized for you
              </Badge>
            </motion.div>
          )}
        </div>

        {mode === 'professional' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              value={skillQuery}
              onChange={(e) => setSkillQuery(e.target.value)}
              placeholder="Search by skill or #tag (e.g. react)"
              className="flex-1 sm:w-64 px-3 py-2 border rounded-md bg-background text-sm"
            />
          </div>
        )}
      </div>

      {/* Trending Hashtags + Skill Context */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/90 dark:bg-slate-900/90 space-y-4 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Trending Now</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {trendingHashtags.slice(0, 6).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => {
                const params = new URLSearchParams(location.search);
                params.set('skill', tag);
                navigate({ pathname: '/feed', search: params.toString() });
                setSkillQuery(tag);
                if (mode !== 'professional') {
                  setMode('professional');
                }
              }}
            >
              #{tag}
            </Badge>
          ))}
        </div>

        {activeSkill && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">Filtered by:</span>
              <Badge variant="outline">{activeSkill}</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => {
                const params = new URLSearchParams(location.search);
                params.delete('skill');
                navigate({ pathname: '/feed', search: params.toString() });
                setSkillQuery('');
              }}
            >
              Clear
            </Button>
          </div>
        )}

        {activeSkill && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] sm:text-xs bg-muted/40 rounded-md px-3 py-2">
            <span className="text-muted-foreground">
              Explore how creators are using <span className="font-semibold">#{activeSkill}</span> in social mode.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px]"
              onClick={() => {
                const params = new URLSearchParams(location.search);
                params.set('skill', activeSkill);
                navigate({ pathname: '/feed', search: params.toString() });
                setMode('social');
              }}
            >
              Browse creative posts
            </Button>
          </div>
        )}

        {activeSkill && peopleForSkill.length > 0 && (
          <div className="mt-3 border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                People with this skill
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {peopleForSkill.length} profile{peopleForSkill.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {peopleForSkill.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-full border px-2 py-1 text-xs cursor-pointer hover:bg-accent/40"
                  onClick={() => navigate('/profile')}
                >
                  <div className="h-6 w-6 rounded-full bg-muted overflow-hidden">
                    {p.avatar ? (
                      <img src={p.avatar} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[10px] font-semibold">
                        {p.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <span>{p.name}</span>
                  {p.openToCollab && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                      Open to collabs
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Posts Feed */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/80 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="h-4 w-40 bg-muted rounded" />
              </div>
              <div className="h-4 w-3/4 bg-muted rounded" />
              <div className="h-48 w-full bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : displayPosts.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/90 dark:bg-slate-900/90">
          <div className="text-lg font-semibold mb-2">No posts yet</div>
          <div className="text-sm text-muted-foreground mb-4">Be the first to share something.</div>
          <Button onClick={() => setIsCreateModalOpen(true)} className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">Create your first post</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {displayPosts.slice(0, visibleCount).map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.03 }}
              >
                <PostCard post={post} />
              </motion.div>
            ))}
          </AnimatePresence>
          {visibleCount < displayPosts.length && (
            <div className="flex flex-col items-center gap-3">
              <div ref={setObserverNode} className="h-1 w-full" />
              <Button variant="outline" onClick={() => setVisibleCount((c) => c + 5)}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

    {/* Create Post Modal */}
    <CreatePostModal
      open={isCreateModalOpen}
      onOpenChange={setIsCreateModalOpen}
    />
  </div>
);
}