import { ResoundProvider, useResound } from "@/context/useResound";
import HudFrame from "@/components/HudFrame";
import Landing from "@/pages/Landing";

function Root() {
  const { route } = useResound();
  return route === "instrument" ? <HudFrame /> : <Landing />;
}

function App() {
  return (
    <ResoundProvider>
      <Root />
    </ResoundProvider>
  );
}

export default App;
