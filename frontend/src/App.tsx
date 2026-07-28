import { useState } from "react"
import OpeningSequence from "./components/ui/opening"
import { AppRouter } from "./router/app-router"

export default function App() {
  const [showOpening, setShowOpening] = useState(true)

  return (
    <div className="page-route-stage">
      {showOpening ? <OpeningSequence onFinished={() => setShowOpening(false)} /> : null}
      <AppRouter />
    </div>
  )
}
