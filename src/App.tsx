import { LinkProvider } from "@astryxdesign/core/Link";
import { useEffect } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Canvas as CanvasComponent } from "./canvas/main.tsx";
import { LibraryBrowserModal } from "./components/library-browser-modal.tsx";
import { UpdatePrompt } from "./components/update-prompt.tsx";
import { Dashboard } from "./features/dashboard/Dashboard.tsx";
import { isTauri } from "./services/tauri.ts";
import { checkForAppUpdates } from "./updater.ts";

let updateCheckStarted = false;
function maybeCheckForUpdates() {
	if (updateCheckStarted || !isTauri()) return;
	updateCheckStarted = true;
	void checkForAppUpdates();
}

function App() {
	useEffect(() => {
		maybeCheckForUpdates();
	}, []);
	return (
		<BrowserRouter>
			<LinkProvider component={Link}>
				<Routes>
					<Route path="/" element={<Dashboard />} />
					<Route path="/canvas/:id" element={<CanvasComponent />} />
				</Routes>
				<LibraryBrowserModal />
				<UpdatePrompt />
			</LinkProvider>
		</BrowserRouter>
	);
}

export default App;
