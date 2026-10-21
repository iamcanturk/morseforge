import { GamePoolProvider } from './shared'
import { DefenderScreen } from './DefenderScreen'
import { RunnerScreen } from './RunnerScreen'

/**
 * The games, each as a single island.
 *
 * The provider has to be inside the component Astro hydrates, not wrapped
 * around it in the page. A React component passed to an island through a slot
 * is rendered on the server and handed over as HTML — it never joins the
 * client-side React tree, so it shares no context and none of its handlers
 * work. The page looked right and every button was dead.
 *
 * `name` and `url` come from the page registry, read by the Astro page at
 * build time: the share text quotes them, and the registry's copy stays out of
 * the island's bundle.
 */

interface GameProps {
  name: string
  url: string
}

export function SignalDefenderGame({ name, url }: GameProps) {
  return (
    <GamePoolProvider>
      <DefenderScreen identity={{ game: 'defender', name, url }} />
    </GamePoolProvider>
  )
}

export function MorseRunnerGame({ name, url }: GameProps) {
  return (
    <GamePoolProvider>
      <RunnerScreen identity={{ game: 'runner', name, url }} />
    </GamePoolProvider>
  )
}
