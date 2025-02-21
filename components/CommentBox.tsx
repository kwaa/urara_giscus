import { MarkdownIcon, MarkGithubIcon, TypographyIcon } from '@primer/octicons-react';
import { ChangeEvent, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { adaptComment, adaptReply, handleCommentClick, processCommentBody } from '../lib/adapter';
import { AuthContext } from '../lib/context';
import { useGiscusTranslation } from '../lib/i18n';
import { IComment, IReply, IUser } from '../lib/types/adapter';
import { resizeTextArea } from '../lib/utils';
import { addDiscussionComment } from '../services/github/addDiscussionComment';
import { addDiscussionReply } from '../services/github/addDiscussionReply';
import { renderMarkdown } from '../services/github/markdown';

interface CommentBoxProps {
  viewer?: IUser;
  discussionId?: string;
  context?: string;
  replyToId?: string;
  onSubmit: (comment: IComment | IReply) => void;
  onDiscussionCreateRequest?: () => Promise<string>;
}

export default function CommentBox({
  viewer,
  discussionId,
  context,
  replyToId,
  onSubmit,
  onDiscussionCreateRequest,
}: CommentBoxProps) {
  const { t } = useGiscusTranslation();
  const [isPreview, setIsPreview] = useState(false);
  const [input, setInput] = useState('');
  const [lastInput, setLastInput] = useState('');
  const [preview, setPreview] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [isFixedWidth, setIsFixedWidth] = useState(false);
  const [lastHeight, setLastHeight] = useState('');
  const { token, origin, getLoginUrl } = useContext(AuthContext);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const loginUrl = getLoginUrl(origin);
  const isReply = !!replyToId;

  useEffect(() => {
    if (isPreview && input !== lastInput) {
      if (input) {
        setIsLoading(true);
        renderMarkdown(input, token, context).then((value) => {
          const processed = processCommentBody(value);
          setPreview(processed);
          setIsLoading(false);
        });
      }
      setLastInput(input);
    }
  }, [isPreview, input, lastInput, token, context]);

  const reset = useCallback(() => {
    setInput('');
    setPreview('');
    setIsPreview(false);
    setIsSubmitting(false);
    setIsReplyOpen(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || (!discussionId && !onDiscussionCreateRequest)) return;
    setIsSubmitting(true);

    const id = discussionId ? discussionId : await onDiscussionCreateRequest();
    const payload = { body: input, discussionId: id, replyToId };

    if (replyToId) {
      addDiscussionReply(payload, token).then(({ data: { addDiscussionReply } }) => {
        const { reply } = addDiscussionReply;
        const adapted = adaptReply(reply);

        onSubmit(adapted);
        reset();
      });
    } else {
      addDiscussionComment(payload, token).then(({ data: { addDiscussionComment } }) => {
        const { comment } = addDiscussionComment;
        const adapted = adaptComment(comment);

        onSubmit(adapted);
        reset();
      });
    }
  }, [
    isSubmitting,
    discussionId,
    input,
    replyToId,
    onDiscussionCreateRequest,
    token,
    onSubmit,
    reset,
  ]);

  const handleReplyOpen = () => {
    setIsReplyOpen(true);
  };

  const handleTextAreaChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setInput(event.target.value);
      // Only resize if it hasn't been resized manually.
      if (!lastHeight || lastHeight === textarea.current.style.height) {
        resizeTextArea(textarea.current);
        setLastHeight(textarea.current.style.height);
      }
    },
    [lastHeight],
  );

  useEffect(() => {
    if (!textarea.current) return;
    if (isReplyOpen) textarea.current.focus();
  }, [isReplyOpen]);

  return !isReply || isReplyOpen ? (
    <form
      className={`color-bg-primary color-border-primary gsc-comment-box${
        isReply ? '' : ' border rounded'
      }`}
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <div className="color-bg-tertiary color-border-primary gsc-comment-box-tabs">
        <div className="mx-2 mb-[-1px] mt-2">
          <button
            className={`px-4 py-2 border border-b-0 focus:outline-none ${
              !isPreview
                ? 'color-text-primary color-bg-canvas rounded-t color-border-primary'
                : 'color-text-secondary border-transparent'
            }`}
            onClick={() => setIsPreview(false)}
            type="button"
          >
            {t('write')}
          </button>
          <button
            className={`px-4 py-2 border border-b-0 focus:outline-none ml-1 ${
              isPreview
                ? 'color-text-primary color-bg-canvas rounded-t color-border-primary'
                : 'color-text-secondary border-transparent'
            }`}
            onClick={() => setIsPreview(true)}
            type="button"
            tabIndex={-1}
          >
            {t('preview')}
          </button>
        </div>

        <div className="gsc-comment-box-md-toolbar">
          <button
            className="gsc-toolbar-item"
            type="button"
            title={isFixedWidth ? t('disableFixedWidth') : t('enableFixedWidth')}
            onClick={() => {
              setIsFixedWidth(!isFixedWidth);
              textarea.current.focus();
            }}
            tabIndex={-1}
          >
            <TypographyIcon />
          </button>
        </div>
      </div>
      <div className="gsc-comment-box-main">
        {isPreview ? (
          <div
            className="markdown color-border-primary gsc-comment-box-preview"
            dangerouslySetInnerHTML={
              isLoading ? undefined : { __html: preview || t('nothingToPreview') }
            }
            onClick={handleCommentClick}
          >
            {isLoading ? t('loadingPreview') : undefined}
          </div>
        ) : (
          <textarea
            className={`form-control input-contrast gsc-comment-box-textarea ${
              isFixedWidth ? 'gsc-is-fixed-width' : ''
            }`}
            placeholder={token ? t('writeAComment') : t('signInToComment')}
            onChange={handleTextAreaChange}
            value={input}
            disabled={!token || isSubmitting}
            ref={textarea}
            onKeyDown={(event) =>
              (event.ctrlKey || event.metaKey) && event.key === 'Enter' && handleSubmit()
            }
          ></textarea>
        )}
      </div>
      <div className="gsc-comment-box-bottom">
        <a
          className="Link--secondary gsc-comment-box-markdown-hint"
          rel="nofollow noopener noreferrer"
          target="_blank"
          href="https://guides.github.com/features/mastering-markdown/"
        >
          <MarkdownIcon className="mr-1" />
          {t('stylingWithMarkdownIsSupported')}
        </a>
        <div className="gsc-comment-box-buttons">
          {isReply ? (
            <button
              className="px-4 py-[5px] ml-1 border rounded-md btn"
              onClick={() => setIsReplyOpen(false)}
              type="button"
            >
              {t('cancel')}
            </button>
          ) : null}
          {token ? (
            <button
              className="px-4 py-[5px] ml-1 border rounded-md items-center btn btn-primary"
              type="submit"
              disabled={(token && !input.trim()) || isSubmitting}
            >
              {isReply ? t('reply') : t('comment')}
            </button>
          ) : (
            <a
              className="px-4 py-[5px] ml-1 border hover:no-underline rounded-md inline-flex items-center btn btn-primary"
              target="_top"
              href={loginUrl}
            >
              <MarkGithubIcon className="mr-2" fill="currentColor" /> {t('signInWithGitHub')}
            </a>
          )}
        </div>
      </div>
    </form>
  ) : (
    <div className="color-bg-tertiary gsc-reply-box">
      {viewer ? (
        <a
          rel="nofollow noopener noreferrer"
          target="_blank"
          href={viewer.url}
          className="flex items-center flex-shrink-0"
        >
          <img
            className="inline-block rounded-full"
            src={viewer.avatarUrl}
            width="30"
            height="30"
            alt={`@${viewer.login}`}
          />
        </a>
      ) : null}
      <button
        className="w-full px-2 py-1 ml-2 text-left border rounded cursor-text form-control color-text-secondary color-border-primary"
        onClick={handleReplyOpen}
        type="button"
      >
        {t('writeAReply')}
      </button>
    </div>
  );
}
