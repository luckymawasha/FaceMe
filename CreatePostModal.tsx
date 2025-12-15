import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Image as ImageIcon, X, Video, Sparkles, Hash } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { usePostStore } from '@/store/postStore';
import { useUserStore } from '@/store/userStore';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadMedia } from '@/lib/storage';
import { generateAIReply } from '@/lib/aiReply';
import { toast } from '@/components/ui/use-toast';

interface CreatePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreatePostModal({ open, onOpenChange }: CreatePostModalProps) {
  const [content, setContent] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const uploadProgressTimerRef = useRef<number | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const { user } = useAuthStore();
  const { addPost, getAISuggestions, trendingHashtags } = usePostStore();
  const { mode, tier, hasTier } = useUserStore();
  const [postMode, setPostMode] = useState<'social' | 'professional'>(mode || 'social');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const uploadGenRef = useRef(0);
  const [isCreatorContent, setIsCreatorContent] = useState(false);
  const [isGeneratingAIContent, setIsGeneratingAIContent] = useState(false);

  const readAsDataURL = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const compressImage = async (file: File, maxSize = 1600): Promise<File> => {
    // Only attempt to compress images
    if (!file.type.startsWith('image/')) return file;
    try {
      const dataUrl = await readAsDataURL(file);
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
      });

      const { width, height } = img;
      const scale = Math.min(1, maxSize / Math.max(width, height));
      if (scale >= 1) return file; // already small enough

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (!b) return reject(new Error('Compression failed'));
            resolve(b);
          },
          'image/jpeg',
          0.8,
        );
      });

      return new File([blob], file.name.replace(/\.(png|webp)$/i, '.jpg'), { type: 'image/jpeg' });
    } catch (err) {
      console.warn('Image compression skipped', err);
      return file;
    }
  };

  const getVideoLimitSeconds = (tier?: string | null) => {
    const t = (tier || '').toLowerCase();
    if (t.startsWith('creator')) return 20 * 60; // 20 minutes
    if (t.startsWith('edu')) return 10 * 60 * 60; // 10 hours
    return 60; // default free tier: 1 minute
  };

  const ensureVideoWithinTierLimit = async (file: File) => {
    if (!file.type.startsWith('video/')) return;
    const limitSeconds = getVideoLimitSeconds(user?.tier as string | undefined);

    await new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const duration = video.duration || 0;
        if (duration > limitSeconds) {
          reject(new Error('video_too_long'));
        } else {
          resolve();
        }
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        // If we can't read metadata, allow upload rather than blocking
        resolve();
      };
    }).catch(() => {
      const seconds = limitSeconds;
      const minutes = Math.round(seconds / 60);
      const hours = Math.round(seconds / 3600);
      const label = hours >= 1 ? `${hours} hour${hours > 1 ? 's' : ''}` : `${minutes} minute${minutes > 1 ? 's' : ''}`;
      alert(`Video is too long for your current tier. Maximum length allowed is ${label}.`);
      throw new Error('video_too_long');
    });
  };

  useEffect(() => {
    if (content.length > 10) {
      const suggestions = getAISuggestions(content);
      setAiSuggestions(suggestions);
    } else {
      setAiSuggestions([]);
    }
  }, [content, getAISuggestions]);

  const cancelUpload = () => {
    uploadGenRef.current += 1;
    setIsUploading(false);
    setUploadProgress(0);
    if (uploadProgressTimerRef.current !== null) {
      window.clearInterval(uploadProgressTimerRef.current);
      uploadProgressTimerRef.current = null;
    }
    setImagePreview(null);
    setVideoPreview(null);
  };

  const handleGenerateAIContent = async () => {
    if (!hasTier('creator')) {
      toast({ 
        title: 'AI Content - Creator+ Feature', 
        description: 'Upgrade to Creator+ tier to use AI-powered content generation.',
        variant: 'destructive' 
      });
      return;
    }

    setIsGeneratingAIContent(true);
    
    try {
      const reply = await generateAIReply({
        context: [], // No conversation context for feed posts
        userMessage: content || 'Generate an engaging social media post',
        tone: postMode === 'professional' ? 'professional' : 'casual',
        maxLength: 200
      });

      setContent(reply);
      toast({ 
        title: 'AI Content Generated', 
        description: 'Review and edit the suggested content before posting.',
      });
    } catch (error) {
      console.error('AI content generation failed:', error);
      toast({ 
        title: 'AI Content Failed', 
        description: 'Failed to generate AI content. Please try again.',
        variant: 'destructive' 
      });
    } finally {
      setIsGeneratingAIContent(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('Image is too large. Please pick a file under 15MB.');
      return;
    }
    try {
      const myGen = ++uploadGenRef.current;
      // Show a quick local preview first so the UI feels instant
      try {
        const dataUrl = await readAsDataURL(file);
        setImagePreview(dataUrl);
        setVideoPreview(null);
      } catch {
        // ignore preview failure, we still try upload
      }

      setIsUploading(true);
      const fileToUpload = await compressImage(file);
      const url = await uploadMedia(fileToUpload, 'posts/images');
      if (uploadGenRef.current !== myGen) return; // cancelled or replaced
      setImagePreview(url);
      setVideoPreview(null);
    } catch (err) {
      console.error('Image upload failed', err);
      const msg = (err as any)?.code || (err as any)?.message || 'Upload failed';
      alert(`Image upload failed: ${msg}.`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isCreatorTier = tier === 'creator';
    const maxBytes = isCreatorTier ? 200 * 1024 * 1024 : 40 * 1024 * 1024; // 200MB for Creator+, 40MB for others
    if (file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      alert(`Video is too large for your current plan. Please pick a file under ${mb}MB or shorten/compress it.`);
      return;
    }
    try {
      await ensureVideoWithinTierLimit(file);
      const myGen = ++uploadGenRef.current;
      setIsUploading(true);
      setUploadProgress(0);
      if (uploadProgressTimerRef.current !== null) {
        window.clearInterval(uploadProgressTimerRef.current);
      }
      uploadProgressTimerRef.current = window.setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev; // wait for real completion to jump to 100
          return prev + 2;
        });
      }, 300);

      const url = await uploadMedia(file, 'posts/videos');
      if (uploadGenRef.current !== myGen) return; // cancelled or replaced
      setVideoPreview(url);
      setImagePreview(null);
      setUploadProgress(100);
      if (uploadProgressTimerRef.current !== null) {
        window.clearInterval(uploadProgressTimerRef.current);
        uploadProgressTimerRef.current = null;
      }
    } catch (err) {
      console.error('Video upload failed', err);
      try {
        const dataUrl = await readAsDataURL(file);
        setVideoPreview(dataUrl);
        setImagePreview(null);
        alert('Cloud upload failed. Using inline video instead.');
      } catch (e2) {
        const msg = (err as any)?.code || (err as any)?.message || 'Upload failed';
        alert(`Video upload failed: ${msg}.`);
      }
    } finally {
      setIsUploading(false);
      if (uploadProgressTimerRef.current !== null) {
        window.clearInterval(uploadProgressTimerRef.current);
        uploadProgressTimerRef.current = null;
      }
    }
  };

  const handlePost = async () => {
    if (!(content.trim() || imagePreview || videoPreview)) return;
    try {
      setIsPosting(true);
      const baseContent = content.trim();
      const finalContent = isCreatorContent && baseContent
        ? `[CREATOR_CONTENT] ${baseContent}`
        : baseContent;
      await addPost(finalContent || content, imagePreview || undefined, videoPreview || undefined, undefined, postMode);
      setContent('');
      setImagePreview(null);
      setVideoPreview(null);
      setAiSuggestions([]);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to create post', err);
      alert('Failed to create post. Please ensure the API is running on http://localhost:4000.');
    } finally {
      setIsPosting(false);
    }
  };

  const removeMedia = () => {
    setImagePreview(null);
    setVideoPreview(null);
  };

  const addHashtag = (hashtag: string) => {
    setContent(prev => prev + ' ' + hashtag);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/95 dark:bg-slate-900/95">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            Create Post
            <Sparkles className="h-4 w-4 text-purple-500" />
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Posting as:</span>
            <div className="flex items-center gap-1">
              <button className={`px-2 py-1 rounded border ${postMode==='social'?'border-primary text-foreground':'border-muted-foreground/30'}`} onClick={() => setPostMode('social')}>Social</button>
              <button className={`px-2 py-1 rounded border ${postMode==='professional'?'border-primary text-foreground':'border-muted-foreground/30'}`} onClick={() => setPostMode('professional')}>Professional</button>
            </div>
          </div>
          {hasTier && hasTier('creator') && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Content type:</span>
              <div className="flex items-center gap-1">
                <button
                  className={`px-2 py-1 rounded-full border text-[11px] ${!isCreatorContent ? 'border-primary text-foreground' : 'border-muted-foreground/30'}`}
                  onClick={() => setIsCreatorContent(false)}
                >
                  Regular post
                </button>
                <button
                  className={`px-2 py-1 rounded-full border text-[11px] ${isCreatorContent ? 'border-purple-500 text-foreground bg-purple-500/10' : 'border-muted-foreground/30'}`}
                  onClick={() => setIsCreatorContent(true)}
                >
                  Creator+ content
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">{user?.name}</p>
            </div>
          </div>

          <Textarea
            placeholder="Share an update, idea, or story..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[120px] resize-none border-0 focus-visible:ring-0 text-base"
          />

          {/* AI Content Generation */}
          {hasTier('creator') && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Need inspiration?</span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateAIContent}
                disabled={isGeneratingAIContent}
                className="text-xs"
              >
                <Sparkles className={`h-3 w-3 mr-1 ${isGeneratingAIContent ? 'animate-pulse' : ''}`} />
                {isGeneratingAIContent ? 'Generating...' : 'Generate with AI'}
              </Button>
            </div>
          )}

          {/* AI Hashtag Suggestions */}
          <AnimatePresence>
            {aiSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span>AI Suggested Hashtags</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiSuggestions.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => addHashtag(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trending Hashtags */}
          <div className="space-y-2">
            <button
              onClick={() => setShowAISuggestions(!showAISuggestions)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Hash className="h-4 w-4" />
              <span>Trending Hashtags</span>
            </button>
            <AnimatePresence>
              {showAISuggestions && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2"
                >
                  {trendingHashtags.slice(0, 8).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => addHashtag('#' + tag)}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Media Preview */}
          {imagePreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900/60"
            >
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-auto object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={removeMedia}
              >
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {videoPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative rounded-xl overflow-hidden"
            >
              <video
                src={videoPreview}
                controls
                className="w-full h-auto"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={removeMedia}
              >
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-200/70 dark:border-slate-800/70">
            <div className="flex items-center space-x-3">
              <label htmlFor="image-upload">
                <Button variant="ghost" size="sm" asChild>
                  <span className="cursor-pointer">
                    <ImageIcon className="h-5 w-5 mr-2 text-green-600" />
                    Photo
                  </span>
                </Button>
              </label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              <label htmlFor="video-upload">
                <Button variant="ghost" size="sm" asChild>
                  <span className="cursor-pointer">
                    <Video className="h-5 w-5 mr-2 text-blue-600" />
                    Video
                  </span>
                </Button>
              </label>
              <input
                id="video-upload"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleVideoUpload}
              />
            </div>

            <div className="flex items-center gap-2">
              {isUploading && (
                <span className="text-[11px] text-muted-foreground mr-1 min-w-[60px] text-right">
                  {`${uploadProgress}%`}
                </span>
              )}
              {isUploading && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-[11px]"
                  onClick={cancelUpload}
                >
                  Cancel upload
                </Button>
              )}
              <Button
                onClick={handlePost}
                disabled={(!
                  content.trim() && !imagePreview && !videoPreview
                ) || isUploading || isPosting}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                {isPosting ? 'Posting...' : isUploading ? 'Uploading...' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}