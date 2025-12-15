import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Heart, MessageCircle, Share2, MoreHorizontal, ThumbsUp, Angry, Laugh, Frown, Smile, Send, Copy, Bookmark, CheckCircle, Mic, Sparkles } from 'lucide-react';
import { usePostStore, type Post } from '@/store/postStore';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { useUserStore } from '@/store/userStore';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { uploadMedia } from '@/lib/storage';
import { generateAIReply } from '@/lib/aiReply';
import { toast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PostCardProps {
  post: Post;
}

const reactions = [
  { icon: Heart, label: 'Love', color: 'text-red-500' },
  { icon: ThumbsUp, label: 'Like', color: 'text-blue-500' },
  { icon: Laugh, label: 'Haha', color: 'text-yellow-500' },
  { icon: Smile, label: 'Wow', color: 'text-orange-500' },
  { icon: Frown, label: 'Sad', color: 'text-gray-500' },
  { icon: Angry, label: 'Angry', color: 'text-red-600' },
];

export default function PostCard({ post }: PostCardProps) {
  const { likePost, addComment, sharePost, editComment, deleteComment, addPost, deletePost, editPost } = usePostStore();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [proCollabMode, setProCollabMode] = useState(false);
  const [showInviteCollab, setShowInviteCollab] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("I'd like to collaborate on this. Here's how I could help...");
  const [showReactions, setShowReactions] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [aiCommentSuggestion, setAiCommentSuggestion] = useState<string>('');
  const [isGeneratingAIComment, setIsGeneratingAIComment] = useState(false);
  const [rlUploading, setRlUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [creatorVideoDuration, setCreatorVideoDuration] = useState<number | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordIntervalRef = useRef<number | null>(null);
  const { setMode, hasTier } = useUserStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const handleLike = () => {
    likePost(post.id);
  };

  const getVideoLimitSeconds = (tier?: string | null) => {
    const t = (tier || '').toLowerCase();
    if (t.startsWith('creator')) return 20 * 60; // 20 minutes
    if (t.startsWith('edu')) return 10 * 60 * 60; // 10 hours
    return 60; // default free tier: 1 minute
  };

  const getAudioLimitSeconds = (tier?: string | null) => {
    const t = (tier || '').toLowerCase();
    if (t.startsWith('creator')) return 5 * 60; // 5 minutes for Creator+
    return 30; // 30 seconds for free and other tiers
  };

  const ensureVideoWithinTierLimit = async (fileOrBlob: File | Blob) => {
    const isVideoFile = fileOrBlob instanceof File && fileOrBlob.type.startsWith('video/');
    // For blobs from camera capture we treat them as image, so only enforce for actual videos here
    if (!isVideoFile) return;

    const limitSeconds = getVideoLimitSeconds(user?.tier as string | undefined);

    await new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
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

  const stopVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !audioStreamRef.current) return;
    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current;
      const stream = audioStreamRef.current;
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        const audioUrl = URL.createObjectURL(audioBlob);
        // Convert to base64 and add as voice comment
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          addComment(post.id, `[REAL_LIFE] ${base64Audio}`);
          URL.revokeObjectURL(audioUrl);
        };
        reader.readAsDataURL(audioBlob);
        // Clean up
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        mediaRecorderRef.current = null;
        clearRecordTimer();
        setIsRecording(false);
        resolve();
      };
      recorder.stop();
    });
  };

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      await stopVoiceRecording();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setRecordSeconds(0);
      const limit = getAudioLimitSeconds(user?.tier as string | undefined);
      clearRecordTimer();
      recordIntervalRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          if (next >= limit) {
            stopVoiceRecording();
          }
          return next;
        });
      }, 1000);
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied or failed', err);
      alert('Unable to access microphone. Please allow mic permissions to record a voice note.');
    }
  };

  const clearRecordTimer = () => {
    if (recordIntervalRef.current !== null) {
      window.clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
  };

  const handleReaction = (reactionType: string) => {
    likePost(post.id, reactionType);
    setShowReactions(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`https://faceme.app/post/${post.id}`);
    setShowShareMenu(false);
  };

  const handleGenerateAIComment = async () => {
    if (!hasTier('creator')) {
      toast({ 
        title: 'AI Comment - Creator+ Feature', 
        description: 'Upgrade to Creator+ tier to use AI-powered comment suggestions.',
        variant: 'destructive' 
      });
      return;
    }

    setIsGeneratingAIComment(true);
    
    try {
      const reply = await generateAIReply({
        context: post.comments.slice(-3).map(c => ({
          sender: c.userName === user?.name ? 'You' : c.userName,
          content: c.content
        })),
        userMessage: post.content,
        tone: 'casual',
        maxLength: 150
      });

      setAiCommentSuggestion(reply);
      setShowComments(true);
      toast({ 
        title: 'AI Comment Generated', 
        description: 'Review and edit the suggested comment before posting.',
      });
    } catch (error) {
      console.error('AI comment generation failed:', error);
      toast({ 
        title: 'AI Comment Failed', 
        description: 'Failed to generate AI comment. Please try again.',
        variant: 'destructive' 
      });
    } finally {
      setIsGeneratingAIComment(false);
    }
  };

  const approveAIComment = async () => {
    if (!aiCommentSuggestion.trim()) return;
    await addComment(post.id, aiCommentSuggestion.trim());
    setAiCommentSuggestion('');
    setShowComments(true);
  };

  const collaborators = Array.from(
    new Set(
      post.comments
        .filter((c) => c.content.startsWith('[PRO COLLAB ACCEPT]'))
        .map((c) => c.userName)
    )
  );

  const handleComment = async () => {
    if (!commentText.trim()) return;
    const finalText = proCollabMode ? `[PRO COLLAB] ${commentText}` : commentText;
    await addComment(post.id, finalText);
    setCommentText('');
    setProCollabMode(false);
  };

  const handleShare = async () => {
    await sharePost(post.id);
    setShowShareMenu(false);
  };

  const handleEditComment = (commentId: string, currentText: string) => {
    setEditingCommentId(commentId);
    setEditingText(currentText);
  };

  const handleSaveEdit = async () => {
    if (!editingText.trim() || !editingCommentId) return;
    await editComment(post.id, editingCommentId, editingText);
    setEditingCommentId(null);
    setEditingText('');
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(post.id, commentId);
  };

  const handleSavePost = async () => {
    // Implement save post functionality
    toast({ title: 'Post Saved', description: 'Post has been saved to your collection.' });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setRlUploading(true);
      const url = await uploadMedia(file, 'posts/images');
      await addComment(post.id, `[REAL_LIFE] ${url}`);
    } catch (err) {
      console.error('Image upload failed', err);
      alert('Failed to upload image. Please try again.');
    } finally {
      setRlUploading(false);
    }
  };

  const isCreatorContent = post.content.startsWith('[CREATOR_CONTENT]') || post.hashtags?.includes('#creator');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="mb-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/90 dark:bg-slate-900/90 hover:shadow-md transition-shadow duration-300">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarImage src={post.userAvatar} alt={post.userName} />
              <AvatarFallback>{post.userName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{post.userName}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(post.timestamp, { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {post.mode === 'professional' && (
              <Badge variant="outline" className="text-xs">
                Professional
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSavePost}>
                  <Bookmark className="mr-2 h-4 w-4" />
                  Save Post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {post.content.replace(/\[CREATOR_CONTENT\]/g, '')}
            </p>
            {post.hashtags && (
              <div className="flex flex-wrap gap-1 mt-2">
                {post.hashtags.map((tag, index) => (
                  <span
                    key={index}
                    className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                    onClick={() => navigate(`/hashtag/${tag.replace('#', '')}`)}
                  >
                    {tag.startsWith('#') ? tag : `#${tag}`}
                  </span>
                ))}
              </div>
            )}
          </div>

          {post.image && (
            <div className="relative rounded-xl overflow-hidden">
              <img
                src={post.image}
                alt="Post image"
                className="w-full h-auto object-cover"
              />
            </div>
          )}

          {post.video && (
            <div className="relative rounded-xl overflow-hidden">
              <video
                src={post.video}
                controls
                className="w-full h-auto"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleLike}
                  className="p-0 h-auto"
                >
                  <Heart className={`h-5 w-5 ${post.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                </Button>
                <span className="text-xs text-muted-foreground">{post.likes || 0}</span>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowComments(!showComments)}
                className="p-0 h-auto"
              >
                <MessageCircle className="h-5 w-5" />
                <span className="ml-1 text-xs text-muted-foreground">{post.comments?.length || 0}</span>
              </Button>

              <div className="relative">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowReactions(!showReactions)}
                  className="p-0 h-auto"
                >
                  <Smile className="h-5 w-5" />
                </Button>
                <AnimatePresence>
                  {showReactions && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-8 left-0 flex space-x-1 bg-white dark:bg-slate-800 p-2 rounded-lg shadow-lg border"
                    >
                      {reactions.map((reaction) => (
                        <Button
                          key={reaction.label}
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReaction(reaction.label)}
                          className="p-1"
                        >
                          <reaction.icon className={`h-4 w-4 ${reaction.color}`} />
                        </Button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="p-0 h-auto"
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {isCreatorContent && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-[11px] sm:text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">Build this creator's fanbase</span>
                <span className="text-muted-foreground">Subscribe to follow their journey, or join members to be part of the inner community and share ideas.</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={subscribed ? 'outline' : 'default'}
                  className="h-7 px-3 text-[11px] bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-80 disabled:cursor-default"
                  onClick={() => setSubscribed((v) => !v)}
                >
                  {subscribed ? 'Subscribed' : 'Subscribe'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-[11px]"
                  onClick={() => {
                    window.open('https://paystack.shop/pay/q-7010qrfm', '_blank');
                  }}
                >
                  Join members
                </Button>
              </div>
            </div>
          )}

          {/* AI Comment Generation */}
          {hasTier('creator') && (
            <div className="mt-2 border-t pt-2">
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleGenerateAIComment} 
                  disabled={isGeneratingAIComment}
                  className="text-purple-600 hover:text-purple-700"
                >
                  <Sparkles className={`h-3 w-3 mr-1 ${isGeneratingAIComment ? 'animate-pulse' : ''}`} />
                  {isGeneratingAIComment ? 'Generating...' : 'Generate AI comment'}
                </Button>
                {aiCommentSuggestion && (
                  <>
                    <div className="flex-1 text-sm bg-muted rounded px-2 py-1">{aiCommentSuggestion}</div>
                    <Button size="sm" onClick={approveAIComment}>Post</Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setAiCommentSuggestion('')}
                    >
                      Discard
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Comments Section */}
          <AnimatePresence>
            {showComments && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800"
              >
                {post.comments
                  .filter((comment) => {
                    // Private visibility for collab invites: only author or sender can see
                    if (comment.content.startsWith('[PRO COLLAB INVITE]')) {
                      const viewerId = '1'; // demo current user
                      const isSender = comment.userId === viewerId;
                      const isAuthor = comment.userId === post.userId || viewerId === post.userId;
                      return isSender || isAuthor;
                    }
                    return true;
                  })
                  .map((comment) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex space-x-3"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={comment.userAvatar} alt={comment.userName} />
                      <AvatarFallback>{comment.userName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 bg-slate-50 dark:bg-slate-900/60 rounded-2xl px-3 py-2 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{comment.userName}</p>
                            {comment.content.startsWith('[PRO COLLAB]') && !comment.content.startsWith('[PRO COLLAB INVITE]') && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Pro collab</span>
                            )}
                            {comment.content.startsWith('[PRO COLLAB INVITE]') && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Collab invite</span>
                            )}
                            {comment.content.startsWith('[REAL_LIFE]') && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">Real life</span>
                            )}
                          </div>
                          <div className="text-sm mt-1">
                            {comment.content.startsWith('[REAL_LIFE]') && comment.content.includes('base64') ? (
                              <audio controls className="w-full">
                                <source src={comment.content.replace('[REAL_LIFE] ', '')} type="audio/webm" />
                                Your browser does not support the audio element.
                              </audio>
                            ) : comment.content.startsWith('[REAL_LIFE]') && !comment.content.includes('base64') ? (
                              <img src={comment.content.replace('[REAL_LIFE] ', '')} alt="Real life content" className="rounded-lg max-w-full" />
                            ) : (
                              <p>{comment.content.replace(/\[(PRO COLLAB|PRO COLLAB INVITE|CREATOR_CONTENT)\s*/g, '')}</p>
                            )}
                          </div>
                          {editingCommentId === comment.id ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Input
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="text-sm"
                                onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                              />
                              <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 mt-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditComment(comment.id, comment.content)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteComment(comment.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(comment.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </motion.div>
                ))}

                <div className="flex flex-col gap-2">
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Write a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleComment()}
                    />
                    <Button
                      variant={proCollabMode ? 'default' : 'outline'}
                      size="sm"
                      className="whitespace-nowrap"
                      onClick={() => setProCollabMode((v) => !v)}
                    >
                      Pro collab
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap"
                      onClick={() => {
                        if (!inviteMessage.trim()) {
                          setInviteMessage("I'd like to collaborate on this. Here's how I could help...");
                        }
                        setShowInviteCollab(true);
                      }}
                    >
                      Invite collab
                    </Button>
                    <Button onClick={handleComment}>Post</Button>
                  </div>

                  {showInviteCollab && (
                    <div className="mt-1 rounded-lg border bg-background/95 p-3 shadow-sm space-y-2">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Pro collab invite</div>
                      <textarea
                        className="w-full min-h-[60px] px-3 py-2 border rounded text-sm bg-transparent"
                        value={inviteMessage}
                        onChange={(e) => setInviteMessage(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowInviteCollab(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const msg = inviteMessage.trim();
                            if (!msg) return;
                            addComment(post.id, `[PRO COLLAB INVITE] ${msg}`);
                            setShowInviteCollab(false);
                          }}
                        >
                          Send invite
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Note:</span> Keep it respectful and on-topic. Avoid sharing personal info.
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={isRecording ? 'default' : 'outline'}
                      size="sm"
                      className="whitespace-nowrap"
                      onClick={toggleVoiceRecording}
                    >
                      <Mic className={`h-4 w-4 mr-2 ${isRecording ? 'animate-pulse' : ''}`} />
                      {isRecording ? 'Stop voice note' : 'Record voice note'}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      {isRecording ? `Recording… ${recordSeconds}s` : 'Record a short voice note as a comment.'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
