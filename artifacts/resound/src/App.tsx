import { ResoundProvider } from "@/context/useResound";
import HudFrame from "@/components/HudFrame";

function App() {
  return (
    <ResoundProvider>
      <HudFrame />
    </ResoundProvider>
  );
}

export default App;
