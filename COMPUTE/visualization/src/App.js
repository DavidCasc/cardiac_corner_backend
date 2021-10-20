import './App.css';
import {
  BrowserRouter as Router,
  Switch,
  Route
} from "react-router-dom";
import Sankey from "./components/Sankey"


function App() {
  return (
    <svg width="100%" height="600" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg">
        <Router>
          <Switch>
            <Route path="/sankey/:data/:width/:height" component={Sankey}/> 
          </Switch>
        </Router>
    </svg>
  );
}

export default App;
