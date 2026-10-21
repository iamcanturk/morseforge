import { GamePoolProvider } from './shared'
import { DefenderScreen } from './DefenderScreen'
import { RunnerScreen } from './RunnerScreen'
import type { IslandMessages } from '../../i18n/islands'
import { I18nProvider } from '../../i18n/react'

/**
 * The games, each as a single island.
 *
 * The provider has to be inside the component Astro hydrates, not wrapped
 * around it in the page. A React component passed to an island through a slot
 * is rendered on the server and handed over as HTML — it never joins the
 * client-side React tree, so it shares no context and none of its handlers
 * work. The page looked right and every button was dead. The same goes for
 * the messages: the page hands them over as the `i18n` prop and the provider
 * is set up here.
 *
 * `name` and `url` come from the page registry, read by the Astro page at
 * build time: the share text quotes them, and the registry's copy stays out of
 * the island's bundle.
 */

interface GameProps {
  name: string
  url: string
  i18n: IslandMessages
}

export function SignalDefenderGame({ name, url, i18n }: GameProps) {
  return (
    <I18nProvider value={i18n}>
      <GamePoolProvider>
        <DefenderScreen identity={{ game: 'defender', name, url }} />
      </GamePoolProvider>
    </I18nProvider>
  )
}

export function MorseRunnerGame({ name, url, i18n }: GameProps) {
  return (
    <I18nProvider value={i18n}>
      <GamePoolProvider>
        <RunnerScreen identity={{ game: 'runner', name, url }} />
      </GamePoolProvider>
    </I18nProvider>
  )
}
