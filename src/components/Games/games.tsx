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
 */

export function SignalDefenderGame() {
  return (
    <GamePoolProvider>
      <DefenderScreen />
    </GamePoolProvider>
  )
}

export function MorseRunnerGame() {
  return (
    <GamePoolProvider>
      <RunnerScreen />
    </GamePoolProvider>
  )
}
