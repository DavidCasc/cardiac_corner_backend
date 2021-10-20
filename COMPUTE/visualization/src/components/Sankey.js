import { Component } from 'react';
import '../App.css';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import chroma from "chroma-js";
var jwt = require('jsonwebtoken');

const SankeyNode = ({ name, x0, x1, y0, y1, color }) => (
    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={color}>
      <title>{name}</title>
    </rect>
)

const SankeyLink = ({ link, color }) => (
    <path
      d={sankeyLinkHorizontal()(link)}
      style={{
        fill: 'none',
        strokeOpacity: '.3',
        stroke: color,
        strokeWidth: Math.max(1, link.width),
      }}
    >
        <title>
            {link.source.name}
        </title>
    </path>
)

const NodeTitle = ({ name, x0, x1, y0, y1, color }) => (
    <text x={x1} y={y0 + ((y1 - y0)/2 + 3)} fill={color} fontSize="9" >
        {name}
    </text>
)

    

class Sankey extends Component {
    render() {
        const height = this.props.match.params.height;
        const width = this.props.match.params.width;
        const {data : data} = jwt.verify(this.props.match.params.data, process.env.REACT_APP_URL_SECRET);
        const { nodes, links} = sankey()
            .nodePadding(10)
            .extent([[1,1], [width -1, height -5]])(data);

        console.log(nodes);
        const color = chroma.scale("Dark2").classes(nodes.length);
        const colorScale = d3
            .scaleLinear()
            .domain([0, nodes.length])
            .range([0,1]);

        return (
                    <g style={{ mixBlendMode: 'multiply' }}>
                        {nodes.map((node, i) => (
                            <NodeTitle
                            {...node}
                                color='#000000'
                                key={node.name}
                            />
                        ))}

                        {nodes.map((node, i) => (
                            <SankeyNode
                                {...node}
                                color={color(colorScale(i)).hex()}
                                key={node.name}
                            />
                        ))}
                        {links.map((link, i) => (
                            <SankeyLink
                                link={link}
                                color={color(colorScale(link.source.index)).hex()}
                                key={link.name}
                            />
                        ))} 
                    </g>
          );
    }
  
}

export default Sankey;
