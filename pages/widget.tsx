import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import Script from 'next/script';
import { ContextType, useContext, useEffect, useState, useRef } from 'react';
import Widget from '../components/Widget';
import { assertOrigin } from '../lib/config';
import { ConfigContext, ThemeContext } from '../lib/context';
import { decodeState } from '../lib/oauth/state';
import { ISetConfigMessage } from '../lib/types/giscus';
import { cleanSessionParam, getOriginHost } from '../lib/utils';
import { env, Theme } from '../lib/variables';
import { getAppAccessToken } from '../services/github/getAppAccessToken';
import { getRepoConfig } from '../services/github/getConfig';
import { availableLanguages } from '../lib/i18n';
import Router from 'next/router';

export async function getServerSideProps({ query, res }: GetServerSidePropsContext) {
  const session = (query.session as string) || '';
  const repo = (query.repo as string) || '';
  const term = cleanSessionParam((query.term as string) || '');
  const category = (query.category as string) || '';
  const number = +query.number || 0;
  const repoId = (query.repoId as string) || '';
  const categoryId = (query.categoryId as string) || '';
  const description = (query.description as string) || '';
  const reactionsEnabled = Boolean(+query.reactionsEnabled);
  const emitMetadata = Boolean(+query.emitMetadata);
  const theme = ((query.theme as string) || 'light') as Theme;
  const { origin, originHost } = getOriginHost((query.origin as string) || '');

  const { encryption_password } = env;
  const token = await decodeState(session, encryption_password)
    .catch(() => getAppAccessToken(repo))
    .catch(() => '');

  const repoConfig = await getRepoConfig(repo, token);

  if (!assertOrigin(originHost, repoConfig)) {
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self';`);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  } else {
    let origins = repoConfig.origins || [];
    if (origins.indexOf(originHost) === -1) {
      origins = [...origins, originHost];
    }
    const originsStr = origins.join(' ');

    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${originsStr};`);
  }

  return {
    props: {
      origin,
      session,
      repo,
      term,
      category,
      number,
      repoId,
      categoryId,
      description,
      reactionsEnabled,
      emitMetadata,
      theme,
      originHost,
    },
  };
}

export default function WidgetPage({
  origin,
  session,
  repo,
  term,
  number,
  category,
  repoId,
  categoryId,
  description,
  reactionsEnabled,
  emitMetadata,
  theme,
  originHost,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const resolvedOrigin = origin || (typeof location === 'undefined' ? '' : location.href);
  const { theme: resolvedTheme, setTheme } = useContext(ThemeContext);
  const [config, setConfig] = useState<ContextType<typeof ConfigContext>>({
    repo,
    term,
    number,
    category,
    reactionsEnabled,
    emitMetadata,
  });

  const ref = useRef(
    ':root {--p: 259 94.4% 51.2%; --pf: 259 94.3% 41%; --pc: 0 0% 100%; --s: 314 100% 47.1%; --sf: 314 100% 37.1%; --sc: 0 0% 100%; --a: 174 60% 51%; --af: 174 59.8% 41%; --ac: 0 0% 100%; --n: 219 14.1% 27.8%; --nf: 222 13.4% 19%; --nc: 0 0% 100%; --b1: 0 0% 100%; --b2: 210 20% 98%; --b3: 216 12.2% 83.9%; --bc: 215 27.9% 16.9%; --in: 207 89.8% 53.9%; --su: 174 100% 29%; --wa: 36 100% 50%; --er: 14 100% 57.1%}',
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== originHost) return;
      if (typeof event.data !== 'object' || !event.data.giscus) return;

      const giscusData = event.data.giscus;
      if (!('setConfig' in giscusData)) return;

      const { setConfig: newConfig } = giscusData as ISetConfigMessage;

      if ('theme' in newConfig) {
        setTheme(newConfig.theme);
        delete newConfig.theme;
      }

      if ('css' in newConfig) {
        ref.current = newConfig.css;
        delete newConfig.css;
      }

      if (Router.isReady && newConfig.lang in availableLanguages) {
        Router.replace(Router.asPath, Router.asPath, {
          locale: newConfig.lang,
          scroll: false,
        });
        delete newConfig.lang;
      }

      setConfig((prevConfig) => ({ ...prevConfig, ...newConfig }));
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [originHost, setTheme]);

  useEffect(() => setTheme(theme), [setTheme, theme]);

  return (
    <>
      <Head>
        <style type="text/css">{ref.current}</style>
        <base target="_top" />
      </Head>

      <main className="w-full mx-auto" data-theme={resolvedTheme}>
        <ConfigContext.Provider value={config}>
          <Widget
            origin={resolvedOrigin}
            session={session}
            repoId={repoId}
            categoryId={categoryId}
            description={description}
          />
        </ConfigContext.Provider>
      </main>

      <Script
        src="/js/iframeResizer.contentWindow.min.js"
        integrity="sha256-rbC2imHDJIBYUIXvf+XiYY+2cXmiSlctlHgI+rrezQo="
        crossOrigin="anonymous"
      />
    </>
  );
}
