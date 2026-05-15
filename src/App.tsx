import { Routes, Route } from "react-router-dom";
import { UserContextProvider } from "./hooks/useUserContext";
import { ResumeBanner } from "./components/ResumeBanner";
import Form from "./routes/Form";
import Results from "./routes/Results";
import Recipe from "./routes/Recipe";
import Cooking from "./routes/Cooking";

export default function App() {
  return (
    <UserContextProvider>
      {/* Global resume banner — appears on every screen if a cook is in
          progress (spec §2). Cooking mode itself hides it. */}
      <ResumeBanner />

      <Routes>
        <Route path="/" element={<Form />} />
        <Route path="/results" element={<Results />} />
        <Route path="/recipe/:id" element={<Recipe />} />
        <Route path="/cook/:id" element={<Cooking />} />
      </Routes>
    </UserContextProvider>
  );
}
